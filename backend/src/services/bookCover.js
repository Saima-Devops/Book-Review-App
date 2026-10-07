const sharp = require("sharp");
const { createHash } = require("node:crypto");
let processing = 0;
const invalid = () => Object.assign(new Error("Choose a valid JPG, PNG, or WebP cover image."), { status: 400 });

module.exports = async function normalizeCover(cover) {
  if (cover === undefined || cover === null) return {};
  if (typeof cover !== "string" || cover.length > 710000) throw invalid();
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(cover);
  if (!match) throw invalid();
  const input = Buffer.from(match[2], "base64");
  if (!input.length || input.length > 512 * 1024 || input.toString("base64") !== match[2]) throw invalid();
  const format = input.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? "jpeg" :
    input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ? "png" :
    input.toString("ascii", 0, 4) === "RIFF" && input.toString("ascii", 8, 12) === "WEBP" ? "webp" : null;
  if (format !== match[1]) throw invalid();
  if (processing >= 2) throw Object.assign(new Error("Cover processing is busy. Please try again shortly."), { status: 429 });
  processing++;
  try {
    const image = sharp(input, { limitInputPixels: 12000000, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== format || (metadata.pages || 1) > 1) throw invalid();
    const data = await image.rotate().resize(900, 1350, { fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" }).jpeg({ quality: 78 }).toBuffer();
    if (data.length > 256 * 1024) throw Object.assign(new Error("This cover is too detailed. Choose a smaller image."), { status: 400 });
    return { coverData: data.toString("base64"), coverVersion: createHash("sha256").update(data).digest("hex") };
  } catch (error) {
    if (error.status) throw error;
    throw invalid();
  } finally { processing--; }
};
