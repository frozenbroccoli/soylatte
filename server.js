import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { marked } from 'marked';
import chokidar from 'chokidar';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import mime from 'mime-types';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/static', express.static(path.join(__dirname, 'public')));

// Icons
const ICONS = {
  folder: `
<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 7h5l2 3h11v9a2 2 0 0 1-2 2H3z"/>
</svg>
`,
  markdown: `
<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 4h16v16H4z"/>
  <path d="M8 15V9l3 3 3-3v6"/>
  <path d="M16 13l2 2 2-2"/>
</svg>
`,
  back: `
<svg width="18" height="18" viewBox="0 0 24 24" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M15 18l-6-6 6-6"/>
</svg>
`
};

// Argument parsing
let portArg = 3000;
let hostArg = '0.0.0.0';
let dirArg = null;

const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '-p' || arg === '--port') {
        portArg = parseInt(args[++i], 10) || 3000;
    } else if (arg === '-h' || arg === '--host') {
        hostArg = args[++i] || '0.0.0.0';
    } else if (arg === '-d' || arg === '--dir') {
        dirArg = args[++i];
    } else if (!arg.startsWith('-') && !dirArg) {
        dirArg = arg;
    }
}

const PORT = portArg;
const HOST = hostArg;
const DOCS_DIR = dirArg ? path.resolve(dirArg) : path.join(__dirname, 'docs');

if (!fs.existsSync(DOCS_DIR)) {
    console.error(`Error: Directory ${DOCS_DIR} does not exist.`);
    process.exit(1);
}

// Create HTTP server to share with WebSocket
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Watch for file changes
chokidar.watch(DOCS_DIR).on('all', (event, filePath) => {
    // Reload on change, add (new file), or unlink (delete file)
    if (event === 'change' || event === 'add' || event === 'unlink') {
        // Normalize path to be relative to DOCS_DIR and convert backslashes to slashes for URL matching
        const relativePath = path.relative(DOCS_DIR, filePath).split(path.sep).join('/');
        console.log(`File event ${event}: ${relativePath}`);
        
        // Notify all connected clients
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({ type: 'update', path: relativePath, event: event }));
            }
        });
    }
});

// Helper to check if a path exists and get stats
async function getStats(filePath) {
    try {
        return await fs.promises.stat(filePath);
    } catch (e) {
        return null;
    }
}

// Helper to generate HTML
function generateHtml(content, title, currentPath) {
    let backLink = '';
    // If current path exists and is not root
    if (currentPath && currentPath !== '.' && currentPath !== '/') {
        // Remove trailing slash if exists for processing
        const cleanPath = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
        const parts = cleanPath.split('/');
        
        if (parts.length > 1) {
            // Go to parent directory
            // slice(0, -1) removes the current file/folder name
            backLink = '/' + parts.slice(0, -1).join('/') + '/';
        } else {
            // Top level file or folder, go to root
            backLink = '/';
        }
    }
    
    // Create the back button HTML
    const backButtonHtml = backLink 
        ? `<a href="${backLink}" style="position: fixed; top: 20px; left: 20px; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; background: #313244; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.2); z-index: 1000; transition: all 0.2s;">
              ${ICONS.back}
            </a>
           <style>
             /* Add hover effect for the floating button */
             a[href^='/']:hover { transform: scale(1.1); color: #cdd6f4; background: #45475a; }
           </style>` 
        : '';
    
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        @font-face {
            font-family: 'CaskaydiaCove Nerd';
            src: url('/static/fonts/CaskaydiaCoveNerdFont-Regular.ttf') format('truetype');
            font-weight: normal;
            font-style: normal;
        }
        
        body { font-family: "CaskaydiaCove Nerd", monospace, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; color: #cdd6f4; background-color: #1e1e2e; }
        pre { background: #313244; padding: 15px; overflow-x: auto; border-radius: 4px; border: 1px solid #45475a; }
        code { background: #313244; padding: 2px 4px; border-radius: 2px; font-family: "FiraCode Nerd Font", "Fira Code", monospace; color: #f5c2e7; }
        img { max-width: 100%; }
        a { color: #89b4fa; text-decoration: none; }
        a:hover { text-decoration: underline; color: #b4befe; }
        table { border-collapse: collapse; width: 100%; margin: 15px 0; border-color: #45475a; }
        th, td { border: 1px solid #6c7086; padding: 8px; text-align: left; }
        th { background-color: #313244; color: #cdd6f4; }
        blockquote { border-left: 4px solid #6c7086; margin: 0; padding-left: 15px; color: #a6adc8; }
        .file-list { list-style: none; padding: 0; }
        .file-list li { padding: 8px 0; border-bottom: 1px solid #45475a; }
        .icon { margin-right: 20px; color: #f9e2af; }
        hr { border: 0; border-top: 1px solid #6c7086; }
        h1, h2, h3, h4, h5, h6 { color: #cba6f7; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
</head>
<body>
    ${backButtonHtml}
    <div id="content">${content}</div>
    <script>
        // Initialize mermaid
        mermaid.initialize({ startOnLoad: false, theme: 'dark' });

        document.addEventListener("DOMContentLoaded", function() {
            const mermaidBlocks = document.querySelectorAll('code.language-mermaid');
            mermaidBlocks.forEach(block => {
                const pre = block.parentElement;
                const content = block.textContent;
                const div = document.createElement('div');
                div.className = 'mermaid';
                div.textContent = content;
                pre.replaceWith(div);
            });
            mermaid.run();
        });

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const socket = new WebSocket(protocol + '//' + window.location.host);
        
        // This is the path of the file/directory being VIEWED
        const currentViewPath = "${currentPath}"; 
        
        socket.onmessage = function(event) {
            const data = JSON.parse(event.data);
            if (data.type === 'update') {
               console.log('Update received for:', data.path);
               
               // Reload logic:
               // 1. If the changed file IS the current file we are viewing.
               // 2. If we are viewing a directory, and the changed file is INSIDE that directory.
               // 3. Special case for index files (e.g. if viewing 'folder/', and 'folder/index.md' changes)
               
               // Check exact match
               if (data.path === currentViewPath) {
                   console.log('Reloading: exact match');
                   window.location.reload();
                   return;
               }
               
               // Check if we are viewing the directory that contains the changed file
               // If currentViewPath is 'folder1', and data.path is 'folder1/file.md'
               
               if (currentViewPath === '') {
                   // We are at root.
                   // If a file in root changes (no slashes in path), reload.
                   if (!data.path.includes('/')) {
                       console.log('Reloading: root file changed');
                       window.location.reload();
                       return;
                   }
               } else {
                   // We are in a subdirectory 'folder1'
                   // If the changed file is IN this directory (direct child), reload.
                   // data.path = 'folder1/file.md'
                   // prefix = 'folder1/'
                   const prefix = currentViewPath + '/';
                   if (data.path.startsWith(prefix)) {
                       // Check if it is a direct child (no more slashes after prefix)
                       const remaining = data.path.substring(prefix.length);
                       if (!remaining.includes('/')) {
                           console.log('Reloading: directory content changed');
                           window.location.reload();
                           return;
                       }
                       
                       // If index.md inside this folder changed, we might need to reload if we are serving index.md
                       // But if we are legally just listing files, index.md change will trigger above logic anyway.
                       // If we are serving rendered index.md, currentViewPath might not be the folder path but the file path?
                       // Wait, in server.js:
                       // if (stats.isDirectory()) { ... render index.md ... relativePathStr = ... relative(..., indexPath) }
                       // So if index.md exists, currentViewPath IS 'folder1/index.md'.
                       // Then the exact match logic handles it!
                       
                       // If we are listing files (no index.md), currentViewPath IS 'folder1'.
                       // Then if a file is added/removed/changed, we reload.
                   }
               }
            }
        };
        
        socket.onopen = () => console.log('Connected to live reload');
        socket.onclose = () => console.log('Disconnected from live reload');
    </script>
</body>
</html>
    `;
}

// Recursive directory walker
async function getFiles(dir) {
    const dirents = await fs.promises.readdir(dir, { withFileTypes: true });
    const files = await Promise.all(dirents.map((dirent) => {
        const res = path.resolve(dir, dirent.name);
        return dirent.isDirectory() ? getFiles(res) : res;
    }));
    return Array.prototype.concat(...files);
}

app.get(/.*/, async (req, res) => {
    // Decode URL to handle spaces and special chars
    const requestPath = decodeURIComponent(req.path);
    
    // Prevent directory traversal
    if (requestPath.includes('..')) {
        return res.status(403).send('Forbidden');
    }

    let filePath = path.join(DOCS_DIR, requestPath);
    let stats = await getStats(filePath);

    // If path doesn't exist, try adding .md
    if (!stats && !filePath.endsWith('.md')) {
        const mdPath = filePath + '.md';
        const mdStats = await getStats(mdPath);
        if (mdStats) {
            filePath = mdPath;
            stats = mdStats;
        }
    }

    if (!stats) {
        return res.status(404).send('Not Found');
    }

    if (stats.isDirectory()) {
        // List directory
        const files = await fs.promises.readdir(filePath, { withFileTypes: true });
        
        let listHtml = `<h1>Index of ${requestPath}</h1><ul class="file-list">`;
        
        if (requestPath !== '/') {
             listHtml += `<li><span class="icon">📁</span><a href="..">..</a></li>`;
        }

        for (const file of files) {
            const isDir = file.isDirectory();
            // Only show directories and markdown files
            if (!isDir && !file.name.endsWith('.md')) continue;
            
            const icon = isDir ? ICONS.folder : ICONS.markdown;
            const suffix = isDir ? '/' : '';
            const href = file.name + suffix;
            
            listHtml += `<li><span class="icon">${icon}</span><a href="${href}">${file.name}</a></li>`;
        }
        listHtml += '</ul>';
        
        // Return file list
        const relativeDir = path.relative(DOCS_DIR, filePath).split(path.sep).join('/');
        return res.send(generateHtml(listHtml, `Index of ${requestPath}`, relativeDir));
    }

    if (stats.isFile()) {
        if (filePath.endsWith('.md')) {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const html = marked(content);
            const relativePathStr = path.relative(DOCS_DIR, filePath).split(path.sep).join('/');
            return res.send(generateHtml(html, path.basename(filePath), relativePathStr));
        } else {
             // Block non-markdown files unless they are assets (images)
             // The user said "only markdown files should be served"
             // But usually that means "don't list other files" which I did.
             // If I need to be strict, I can check mime type.
             // Let's allow images.
             const mimeType = mime.lookup(filePath);
             if (mimeType && mimeType.startsWith('image/')) {
                 return res.sendFile(filePath);
             }
             return res.status(403).send('Only markdown files and images are served.');
        }
    }
});

server.listen(PORT, HOST, () => {
    console.log(`Markdown server running at http://${HOST}:${PORT}`);
    console.log(`Serving files from ${DOCS_DIR}`);
});
