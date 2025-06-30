// server.js

const http = require('http');
const formidable = require('formidable');
const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, 'uploads'); // Directory where uploaded files will be stored
const PUBLIC_DIR = path.join(__dirname, 'public'); // Directory for your static client-side files

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript', // Crucial for client.js
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    // Add other MIME types as needed for your static files
};

// Ensure the upload directory exists. If not, create it.
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true }); // `recursive: true` ensures parent directories are also created if needed
}

console.log(`Upload directory: ${UPLOAD_DIR}`);
console.log(`Public directory (for static files): ${PUBLIC_DIR}`);


// Create the HTTP server
const server = http.createServer((req, res) => {
    // Set CORS headers to allow requests from any origin (useful for testing from different devices/browsers)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS'); // Added DELETE method
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

    console.log(`[SERVER] --- New Request ---`);
    console.log(`[SERVER] Request Method: ${req.method}`);
    console.log(`[SERVER] Request URL: ${req.url}`);

    // Handle OPTIONS requests (pre-flight requests for CORS)
    if (req.method === 'OPTIONS') {
        console.log('[SERVER] Routing: Matched OPTIONS request.');
        res.writeHead(204); // No Content
        res.end();
        return;
    }

    // --- Handle File Uploads (POST /upload) ---
    if (req.url === '/upload' && req.method === 'POST') {
        console.log('[SERVER] Routing: Matched POST /upload.');
        const form = new formidable.IncomingForm({
            uploadDir: UPLOAD_DIR, // Temporary directory for uploads
            keepExtensions: true,   // Keep original file extensions
            maxFileSize: 500 * 1024 * 1024, // Max file size: 500MB (adjust as needed)
        });

        form.parse(req, (err, fields, files) => {
            if (err) {
                console.error('[SERVER] Error parsing form:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'File upload failed.', error: err.message }));
                return;
            }

            const uploadedFile = files.myFile && Array.isArray(files.myFile) ? files.myFile[0] : files.myFile;

            if (!uploadedFile) {
                console.log('[SERVER] File field "myFile" not found or empty, or no files uploaded.');
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'No file uploaded or file field "myFile" not found.' }));
                return;
            }

            const oldPath = uploadedFile.filepath;
            const fileName = uploadedFile.originalFilename;
            const newPath = path.join(UPLOAD_DIR, fileName);

            fs.rename(oldPath, newPath, (renameErr) => {
                if (renameErr) {
                    console.error('[SERVER] Error renaming file:', renameErr);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Error saving file.', error: renameErr.message }));
                    return;
                }
                console.log(`[SERVER] File uploaded and saved: ${fileName}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, message: 'File uploaded successfully!', fileName: fileName }));
            });
        });
    }

    // --- Handle File Listings (GET /files) ---
    else if (req.url === '/files' && req.method === 'GET') {
        console.log('[SERVER] Routing: Matched GET /files.');
        fs.readdir(UPLOAD_DIR, (err, files) => {
            if (err) {
                console.error('[SERVER] Error reading upload directory:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Could not list files.' }));
                return;
            }
            const fileNames = files.filter(file => {
                try {
                    return fs.statSync(path.join(UPLOAD_DIR, file)).isFile();
                } catch (e) {
                    console.warn(`[SERVER] Could not stat file ${file}: ${e.message}`);
                    return false;
                }
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, files: fileNames }));
        });
    }

    // --- Handle File Downloads (GET /download/:filename) ---
    else if (req.url.startsWith('/download/') && req.method === 'GET') {
        console.log(`[SERVER] Routing: Matched GET /download/*.`);
        const fileName = decodeURIComponent(req.url.split('/').pop());
        const filePath = path.join(UPLOAD_DIR, fileName);
        console.log(`[SERVER] Attempting to serve file: ${fileName} from ${filePath}`);

        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                console.error(`[SERVER] File not found: ${fileName}`, err);
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('File not found.');
                return;
            }

            res.writeHead(200, {
                'Content-Type': 'application/octet-stream', // Generic binary for download
                'Content-Disposition': `attachment; filename="${fileName}"`
            });

            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);

            fileStream.on('error', (streamErr) => {
                console.error(`[SERVER] Error streaming file ${fileName}:`, streamErr);
                res.end('Error downloading file.');
            });
        });
    }

    // --- Handle File Deletion (DELETE /delete/:filename) ---
    else if (req.url.startsWith('/delete/') && req.method === 'DELETE') {
        console.log(`[SERVER] Routing: Matched DELETE /delete/*.`);
        const fileName = decodeURIComponent(req.url.split('/').pop());
        const filePath = path.join(UPLOAD_DIR, fileName);
        console.log(`[SERVER] Attempting to delete file: ${fileName} from ${filePath}`);

        fs.unlink(filePath, (err) => {
            if (err) {
                console.error(`[SERVER] Error deleting file ${fileName}:`, err);
                if (err.code === 'ENOENT') {
                    console.log(`[SERVER] Sending 404 response for ${fileName}`);
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'File not found.' }));
                } else {
                    console.log(`[SERVER] Sending 500 response for ${fileName} due to other error.`);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: `Failed to delete file: ${err.message}` }));
                }
                return;
            }
            console.log(`[SERVER] File deleted: ${fileName}. Sending 200 success response.`);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, message: 'File deleted successfully!' }));
        });
    }

    // --- Serve Static Files (HTML, JS, CSS, Images, etc.) ---
    else {
        // Determine the requested file path. If it's root '/', serve index.html.
        let requestedPath = req.url === '/' ? '/client.html' : req.url;
        let filePath = path.join(PUBLIC_DIR, requestedPath);

        // Get the file extension to determine the MIME type
        const extname = String(path.extname(filePath)).toLowerCase();
        const contentType = mimeTypes[extname] || 'application/octet-stream'; // Default to binary stream

        console.log(`[SERVER] Routing: Serving static file: ${filePath} with type ${contentType}`);

        fs.readFile(filePath, (error, content) => {
            if (error) {
                if (error.code === 'ENOENT') {
                    // File not found (e.g., /nonexistent.js)
                    console.error(`[SERVER] Static file not found: ${filePath}`);
                    res.writeHead(404, { 'Content-Type': 'text/html' }); // Send HTML 404
                    res.end('<h1>404 Not Found</h1><p>The requested file could not be found.</p>');
                } else {
                    // Server error (e.g., permissions)
                    console.error(`[SERVER] Error reading static file ${filePath}:`, error);
                    res.writeHead(500);
                    res.end('<h1>500 Internal Server Error: ' + error.code + '</h1>');
                }
            } else {
                // Success: set correct content type and send the file
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content, 'utf-8');
            }
        });
    }
});

const PORT = 3000; // Port on which the server will listen
const HOST = '0.0.0.0'; // Change host to 0.0.0.0 to listen on all network interfaces

// Start the server
server.listen(PORT, HOST, () => {
    console.log(`Server running at http://${HOST}:${PORT}/`);
    console.log(`Accessible from your local network at: http://Your.Computer.IP.Address:${PORT}/`);
    console.log('Example: http://192.168.1.X:3000/');
});