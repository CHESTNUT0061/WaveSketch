import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appDirectory = path.resolve(scriptDirectory, '..');
const distDirectory = path.join(appDirectory, 'dist');

const previewSourcePath = path.join(appDirectory, 'responsive-preview.html');
const previewOutputPath = path.join(distDirectory, 'responsive-preview.html');
const indexPath = path.join(distDirectory, 'index.html');
const readmePath = path.join(distDirectory, 'README-手机离线预览.txt');

const previewSource = await readFile(previewSourcePath, 'utf8');
const offlinePreview = previewSource.replace(
  '<iframe id="preview" src="./" title="WaveSketch 响应式预览"></iframe>',
  '<iframe id="preview" src="./index.html" title="WaveSketch 响应式预览"></iframe>',
);

if (offlinePreview === previewSource) {
  throw new Error('Unable to locate the responsive preview iframe source.');
}

const builtIndex = await readFile(indexPath, 'utf8');
const offlineIndex = builtIndex
  .replace(/^\s*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com" \/>\r?\n/m, '')
  .replace(/^\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin \/>\r?\n/m, '')
  .replace(/^\s*<link href="https:\/\/fonts\.googleapis\.com\/[^\n]+\r?\n/m, '');

const readme = `WaveSketch v1.0.6 手机离线预览包

这个 dist 文件夹已经包含编译后的应用和响应式预览页，不需要在手机上安装 Node.js。

使用方法：
1. 将整个 dist 文件夹同步到手机，不能只复制其中一个 HTML 文件。
2. 在手机的本地 HTTP Server 中，把网站根目录设置为这个 dist 文件夹。
3. 在手机浏览器打开服务器显示的地址：
   - 响应式预览：/responsive-preview.html
   - 直接打开应用：/index.html

例如服务器端口是 8080：
http://127.0.0.1:8080/responsive-preview.html

注意：
- 不要直接使用 file:// 打开，移动浏览器通常会阻止 ES Module 或 iframe 加载。
- 127.0.0.1 在这里表示手机本机，所以本地 HTTP Server 必须运行在手机上。
- 波形数据仍保存在当前手机浏览器的本地存储中。
`;

await Promise.all([
  writeFile(previewOutputPath, offlinePreview, 'utf8'),
  writeFile(indexPath, offlineIndex, 'utf8'),
  writeFile(readmePath, readme, 'utf8'),
]);

console.log(`Offline preview created: ${distDirectory}`);
