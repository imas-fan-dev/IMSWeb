from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
PUBLIC_ROOT = PROJECT_ROOT / "apps/web/public"
SERIES_WALL_SOURCE = PROJECT_ROOT / "apps/web/app/lib/series-wall.ts"


class PublicAssetTests(unittest.TestCase):
    def test_series_catalog_uses_only_existing_webp_delivery_assets(self):
        source = SERIES_WALL_SOURCE.read_text(encoding="utf-8")
        paths = re.findall(r'(?:image|icon): "([^\"]+)"', source)
        self.assertEqual(len(paths), 12)
        self.assertEqual(len(set(paths)), 6)
        for public_path in set(paths):
            self.assertTrue(
                (PUBLIC_ROOT / public_path.removeprefix("/")).is_file(),
                public_path,
            )
            self.assertTrue(public_path.endswith(".webp"), public_path)

    def test_redundant_series_delivery_copies_are_absent(self):
        redundant = (
            "brand/imsweb-logo.png",
            "brand/series/765pro.png",
            "brand/series/cinderella-girls.png",
            "brand/series/gakuen.png",
            "brand/series/million-live.png",
            "brand/series/shiny-colors.png",
            "brand/series/sidem.png",
            "brand/series/wall/765pro.png",
            "brand/series/wall/cinderella-girls.png",
            "brand/series/wall/gakuen.png",
            "brand/series/wall/million-live.png",
            "brand/series/wall/shiny-colors.png",
            "brand/series/wall/sidem.png",
        )
        for relative_path in redundant:
            self.assertFalse((PUBLIC_ROOT / relative_path).exists(), relative_path)


if __name__ == "__main__":
    unittest.main()
