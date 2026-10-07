"use client";
import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Upload, X } from "lucide-react";

export default function CoverUploadDialog({ initialCover, onSave, onClose }) {
  const dialogRef = useRef(null);
  const fileRef = useRef(null);
  const busyRef = useRef(false);
  const titleId = useId();
  const [cover, setCover] = useState(initialCover);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = overflow; };
  }, []);
  const focusInside = (event) => {
    if (event.key !== "Tab") return;
    const controls = [...dialogRef.current.querySelectorAll("button:not(:disabled)")];
    const first = controls[0], last = controls[controls.length - 1];
    if (!first) { event.preventDefault(); dialogRef.current.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) { event.preventDefault(); first.focus(); }
  };
  const choose = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || busyRef.current) return;
    setError("");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError("Choose a JPG, PNG, or WebP image up to 5 MB."); return;
    }
    busyRef.current = true; setProcessing(true); dialogRef.current.focus();
    let bitmap;
    try {
      bitmap = await createImageBitmap(file, { resizeWidth: 900, resizeQuality: "high" });
      const scale = Math.min(1, 1350 / bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      let next;
      for (const quality of [0.78, 0.65, 0.5, 0.35]) {
        next = canvas.toDataURL("image/jpeg", quality);
        if (next.length < 300000) break;
      }
      if (!next || next.length >= 300000) throw new Error("Image is too detailed");
      setCover(next);
    } catch { setError("This image could not be prepared. Try a smaller JPG or PNG."); }
    finally { bitmap?.close(); busyRef.current = false; setProcessing(false); }
  };
  return <dialog ref={dialogRef} tabIndex={-1} className="confirmation-dialog cover-upload-dialog" aria-labelledby={titleId} aria-busy={processing} onKeyDown={focusInside}
    onCancel={(event) => { event.preventDefault(); if (!busyRef.current) onClose(); }}>
    <div className="confirmation-icon"><ImagePlus aria-hidden="true" /></div>
    <h2 id={titleId}>Book cover</h2>
    <div className="cover-upload-preview">{cover ? <Image src={cover} alt="Selected book cover" fill unoptimized sizes="240px" /> : <ImagePlus size={42} strokeWidth={1.3} aria-hidden="true" />}</div>
    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={choose} hidden />
    <div className="cover-picker-actions"><button className="chip" type="button" disabled={processing} onClick={() => fileRef.current.click()}><Upload size={16} aria-hidden="true" />{cover ? "Choose another image" : "Choose image"}</button>
      {cover && <button className="chip" type="button" disabled={processing} onClick={() => setCover(null)}><X size={16} aria-hidden="true" />Remove</button>}</div>
    <p className="cover-upload-help">JPG, PNG or WebP. Maximum 5 MB.</p>
    {processing && <p role="status">Preparing cover...</p>}
    {error && <p className="error" role="alert">{error}</p>}
    <div className="confirmation-actions"><button className="chip" type="button" disabled={processing} onClick={onClose}>Cancel</button>
      <button className="primary" type="button" disabled={processing} onClick={() => onSave(cover)}>{cover ? "Use cover" : "Continue without cover"}</button></div>
  </dialog>;
}
