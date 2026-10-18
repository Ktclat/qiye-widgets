"""Release archives are self-contained; published version assets are immutable."""
from pathlib import Path
import json,subprocess,sys,tempfile,unittest,zipfile
ROOT=Path(__file__).resolve().parents[1]
class ReleaseBuild(unittest.TestCase):
 def test_archive_and_published_guard(self):
  with tempfile.TemporaryDirectory() as folder:
   dest=Path(folder);version=json.loads((ROOT/'package.json').read_text())['version']
   command=[sys.executable,str(ROOT/'scripts/build.py'),'--output',str(dest)]
   subprocess.run(command,check=True,capture_output=True)
   release=dest/'releases'/version
   with zipfile.ZipFile(dest/f'qiye-widgets-{version}.zip') as archive:
    for name in ['widget.html','runtime.js','styles.css','index.json']:
     self.assertEqual(archive.read('releases/'+version+'/'+name),(release/name).read_bytes())
   # Re-running an unchanged release is safe; altering any published resource is refused.
   subprocess.run(command,check=True,capture_output=True)
   for name in ['widget.html','runtime.js','styles.css']:
    path=release/name;original=path.read_bytes();path.write_bytes(b'published sentinel')
    result=subprocess.run(command,capture_output=True,text=True)
    self.assertNotEqual(result.returncode,0)
    self.assertIn('Refusing to overwrite a published version',result.stderr)
    self.assertEqual(path.read_bytes(),b'published sentinel')
    path.write_bytes(original)
if __name__=='__main__':unittest.main()
