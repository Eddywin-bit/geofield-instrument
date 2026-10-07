"""Exercise the actual CI generator and guard against duplicate provider classes."""

from pathlib import Path
import subprocess
import sys
import tempfile
import textwrap
import unittest
import xml.etree.ElementTree as ET


class UpdateProviderTest(unittest.TestCase):
    def test_updater_has_its_own_provider_component(self):
        root = Path(__file__).resolve().parents[1]
        workflow = (root / ".github/workflows/build-apk.yml").read_text()
        step = workflow.split("- name: Inject ApkInstaller native plugin", 1)[1]
        step = step.split("\n      - ", 1)[0]
        script = textwrap.dedent(
            step.split("<<'PY'\n", 1)[1].split("\n          PY", 1)[0]
        )
        with tempfile.TemporaryDirectory() as directory:
            fixture = Path(directory)
            package = fixture / "android/app/src/main/java/com/eondesigns/geofield"
            package.mkdir(parents=True)
            (package / "MainActivity.java").write_text(
                "registerPlugin(EnableLocationPlugin.class);"
            )
            manifest = fixture / "android/app/src/main/AndroidManifest.xml"
            manifest.write_text(
                '<manifest xmlns:android="http://schemas.android.com/apk/res/android">'
                '<application><provider android:name="androidx.core.content.FileProvider" '
                'android:authorities="com.eondesigns.geofield.fileprovider" />'
                '</application></manifest>'
            )
            subprocess.run([sys.executable, "-c", script], cwd=fixture, check=True)
            android = "{http://schemas.android.com/apk/res/android}"
            providers = ET.parse(manifest).findall("application/provider")
            names = [provider.get(android + "name") for provider in providers]
            self.assertEqual(len(names), len(set(names)))
            update = next(
                provider for provider in providers
                if provider.get(android + "authorities") == "com.eondesigns.geofield.updateprovider"
            )
            self.assertEqual(
                update.get(android + "name"), "com.eondesigns.geofield.UpdateFileProvider"
            )
            self.assertEqual(update.get(android + "exported"), "false")
            self.assertEqual(update.get(android + "grantUriPermissions"), "true")
            self.assertIn(
                "class UpdateFileProvider extends FileProvider",
                (package / "UpdateFileProvider.java").read_text(),
            )


if __name__ == "__main__":
    unittest.main()
