import re
import unittest
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
DOCUMENTS = [ROOT / 'README.md', ROOT / 'installation_guide.md', ROOT / 'db/initialization.md', *sorted((ROOT / 'docs').glob('*.md'))]


class DocumentationTests(unittest.TestCase):
    def test_repository_links_resolve(self):
        for document in DOCUMENTS:
            for link in re.findall(r'\[[^\]]*\]\(([^)]+)\)', document.read_text()):
                if re.match(r'[a-z]+://', link) or link.startswith('#'):
                    continue
                target = unquote(link.split('#')[0])
                with self.subTest(document=document.name, target=target):
                    self.assertTrue((document.parent / target).exists())

    def test_brand_and_attribution_are_consistent(self):
        for document in DOCUMENTS:
            text = document.read_text()
            with self.subTest(document=document.name):
                self.assertIn('Saima Usman', text)
                self.assertNotIn('/Users/saimausman', text)
                self.assertNotIn('13.232.206.202', text)
                self.assertNotIn('Add your screenshot here', text)

    def test_code_fences_are_balanced(self):
        for document in DOCUMENTS:
            with self.subTest(document=document.name):
                self.assertEqual(sum(line.startswith('```') for line in document.read_text().splitlines()) % 2, 0)

    def test_pdf_is_present_and_classified_as_binary(self):
        self.assertTrue((ROOT / 'installation_guide.pdf').read_bytes().startswith(b'%PDF-'))
        self.assertIn('*.pdf binary', (ROOT / '.gitattributes').read_text())
