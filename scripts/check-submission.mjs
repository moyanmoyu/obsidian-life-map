/**
 * Pre-flight checks for the Obsidian community directory submission.
 * Run: npm run check:submission
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const problems = [];
const notes = [];

const ok = (msg) => console.log(`  ✓ ${msg}`);
const bad = (msg) => {
	problems.push(msg);
	console.log(`  ✗ ${msg}`);
};

const read = (file) => fs.readFileSync(file, 'utf8');
const json = (file) => JSON.parse(read(file));

console.log('manifest.json');
const manifest = json('manifest.json');
const required = ['id', 'name', 'version', 'minAppVersion', 'description', 'author', 'isDesktopOnly'];
for (const field of required) {
	if (manifest[field] === undefined || manifest[field] === '') bad(`缺少字段 ${field}`);
	else ok(`字段 ${field} = ${JSON.stringify(manifest[field])}`);
}
if (!/^[a-z0-9-]+$/.test(manifest.id ?? '')) bad('id 只能包含小写字母、数字和连字符');
if ((manifest.description ?? '').length > 250) bad(`description 超过 250 字符（当前 ${manifest.description.length}）`);
else notes.push(`description 长度 ${manifest.description.length}/250`);
if (typeof manifest.isDesktopOnly !== 'boolean') bad('isDesktopOnly 必须是布尔值');

console.log('\n版本一致性');
const pkg = json('package.json');
const versions = json('versions.json');
if (pkg.version !== manifest.version) bad(`package.json ${pkg.version} ≠ manifest ${manifest.version}`);
else ok(`版本 ${manifest.version}`);
if (!versions[manifest.version]) bad(`versions.json 缺少 ${manifest.version}`);
else ok(`versions.json 记录了 ${manifest.version}`);
try {
	const tags = execFileSync('git', ['tag', '-l'], { encoding: 'utf8' }).split('\n');
	if (!tags.includes(`v${manifest.version}`)) bad(`本地缺少 tag v${manifest.version}`);
	else ok(`本地存在 tag v${manifest.version}`);
} catch {
	notes.push('无法读取 git tag');
}

console.log('\n必需文件');
for (const file of ['LICENSE', 'README.md', 'README.en.md', 'manifest.json']) {
	if (fs.existsSync(file)) ok(file);
	else bad(`缺少 ${file}`);
}

console.log('\n发布合规');
const readme = read('README.md') + read('README.en.md');
if (/telemetry|遥测/i.test(readme)) ok('README 声明了遥测策略');
else bad('README 未声明遥测策略（目录要求披露）');
if (/network|网络访问|http/i.test(readme)) ok('README 声明了网络访问');
else bad('README 未披露网络访问');
if (/data\.json/.test(readme)) ok('README 说明了凭证存储位置');
else notes.push('建议在 README 说明 data.json 明文存储');

if (/data\.json/.test(read('.gitignore'))) ok('.gitignore 忽略 data.json');
else bad('.gitignore 未忽略 data.json');

const tracked = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
if (tracked.split('\n').includes('data.json')) bad('data.json 已被 git 跟踪！');
else ok('仓库未跟踪 data.json');
if (tracked.split('\n').some((f) => f.endsWith('.zip'))) bad('仓库里跟踪了 zip 文件');
else ok('仓库未跟踪压缩包');

console.log('\n提示');
for (const note of notes) console.log(`  · ${note}`);

if (problems.length > 0) {
	console.log(`\n${problems.length} 项未通过`);
	process.exit(1);
}
console.log('\n全部通过，可以提交 PR');
