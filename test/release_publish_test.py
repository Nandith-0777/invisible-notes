"""Verify draft release publishing without network access or real GitHub writes."""
from pathlib import Path
import json
import os
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/publish-release.sh'
SHA = 'a' * 40


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        (self.root / 'bin').mkdir()
        (self.root / 'release-assets').mkdir()
        for suffix in ['exe', 'dmg', 'deb']:
            (self.root / 'release-assets' / ('installer.' + suffix)).write_text('test')
        self.log = self.root / 'gh-log.jsonl'
        git = self.root / 'bin/git'
        git.write_text('''#!/usr/bin/env python3
import os,sys
if os.environ.get('GIT_NETWORK_ERROR'):sys.exit(128)
print(os.environ.get('REMOTE_REFS',''))
''')
        gh = self.root / 'bin/gh'
        gh.write_text('''#!/usr/bin/env python3
import json,os,sys
args=sys.argv[1:]
if args[:2]==['release','view']:
 value=os.environ.get('EXISTING_RELEASE','')
 if not value:sys.exit(1)
 print(value)
else:
 with open(os.environ['GH_LOG'],'a') as f:f.write(json.dumps(args)+'\\n')
''')
        git.chmod(0o755)
        gh.chmod(0o755)
        self.env = {**os.environ, 'PATH': str(self.root / 'bin') + ':' + os.environ['PATH'],
                    'GH_REPO': 'test/notes', 'GITHUB_SHA': SHA,
                    'RELEASE_TAG': 'v1.3.0-beta.1', 'RELEASE_VERSION': '1.3.0-beta.1',
                    'IS_PRERELEASE': 'true', 'GH_LOG': str(self.log),
                    'REMOTE_REFS': '', 'EXISTING_RELEASE': ''}
        self.env.pop('GIT_NETWORK_ERROR', None)

    def run_publish(self, **env):
        return subprocess.run(['bash', str(SCRIPT)], cwd=self.root,
                              env={**self.env, **env}, capture_output=True, text=True)

    def calls(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()] if self.log.exists() else []

    def test_first_release_without_tag_creates_draft(self):
        result = self.run_publish()
        self.assertEqual(result.returncode, 0, result.stderr)
        calls = self.calls()
        self.assertEqual(calls[0][:3], ['release', 'create', 'v1.3.0-beta.1'])
        self.assertIn('--draft', calls[0])
        self.assertIn('--prerelease', calls[0])
        self.assertEqual(calls[-1][:2], ['release', 'upload'])

    def test_existing_draft_is_updated(self):
        result = self.run_publish(EXISTING_RELEASE='true', REMOTE_REFS=SHA + '\trefs/tags/v1.3.0-beta.1')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.calls()[0][:2], ['release', 'edit'])

    def test_published_release_is_never_overwritten(self):
        result = self.run_publish(EXISTING_RELEASE='false')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('published release', result.stdout)
        self.assertEqual(self.calls(), [])

    def test_tag_at_other_commit_is_rejected(self):
        result = self.run_publish(REMOTE_REFS='b' * 40 + '\trefs/tags/v1.3.0-beta.1')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_network_error_is_not_treated_as_missing_tag(self):
        result = self.run_publish(GIT_NETWORK_ERROR='1')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_annotated_tag_uses_peeled_commit(self):
        refs = 'b' * 40 + '\trefs/tags/v1.3.0-beta.1\n' + SHA + '\trefs/tags/v1.3.0-beta.1^{}'
        result = self.run_publish(REMOTE_REFS=refs)
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_stable_version_is_still_draft_but_not_prerelease(self):
        result = self.run_publish(IS_PRERELEASE='false', RELEASE_TAG='v1.3.0', RELEASE_VERSION='1.3.0')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('--draft', self.calls()[0])
        self.assertNotIn('--prerelease', self.calls()[0])


if __name__ == '__main__':
    unittest.main()
