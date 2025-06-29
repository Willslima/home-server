// server.js
// This script sets up a simple HTTP server using Node.js to handle file uploads and downloads.

const http = require('http'); // Node.js HTTP module for creating web servers
const formidable = require('formidable'); // Module for parsing form data, especially file uploads
const fs = require('fs'); // Node.js File System module for interacting with the file system
const path = require('path'); // Node.js Path module for handling file paths

const UPLOAD_DIR = path.join(__dirname, 'uploads'); // Directory where uploaded files will be stored

// Ensure the upload directory exists. If not, create it.
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true }); // `recursive: true` ensures parent directories are also created if needed
}

console.log(`Upload directory: ${UPLOAD_DIR}`);

// Create the HTTP server
const server = http.createServer((req, res) => {
    // Set CORS headers to allow requests from any origin (useful for testing from different devices/browsers)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Requested-With');

    console.log(`[SERVER] Request received: ${req.method} ${req.url}`); // Log every incoming request

    // Handle OPTIONS requests (pre-flight requests for CORS)
    if (req.method === 'OPTIONS') {
        console.log('[SERVER] Handling OPTIONS request.');
        res.writeHead(204); // No Content
        res.end();
        return;
    }

    // --- Handle File Uploads (POST /upload) ---
    if (req.url === '/upload' && req.method === 'POST') {
        console.log('[SERVER] Matched: POST /upload');
        const form = new formidable.IncomingForm({
            uploadDir: UPLOAD_DIR, // Temporary directory for uploads
            keepExtensions: true,   // Keep original file extensions
            maxFileSize: 500 * 1024 * 1024, // Max file size: 500MB (adjust as needed)
        });

        // Parse the incoming form data
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

            const oldPath = uploadedFile.filepath; // Temporary path of the uploaded file
            const fileName = uploadedFile.originalFilename; // Original name of the file
            const newPath = path.join(UPLOAD_DIR, fileName); // Permanent path for the file

            // Rename the file from its temporary path to its permanent path in the uploads directory
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
        console.log('[SERVER] Matched: GET /files');
        // Read the contents of the upload directory
        fs.readdir(UPLOAD_DIR, (err, files) => {
            if (err) {
                console.error('[SERVER] Error reading upload directory:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Could not list files.' }));
                return;
            }
            // Filter out any directories, only return actual files
            const fileNames = files.filter(file => {
                try { // Use try-catch for fs.statSync as it can throw if file is inaccessible
                    return fs.statSync(path.join(UPLOAD_DIR, file)).isFile();
                } catch (e) {
                    console.warn(`[SERVER] Could not stat file ${file}: ${e.message}`);
                    return false; // Exclude files that cause stat errors
                }
            });
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, files: fileNames }));
        });
    }

    // --- Handle File Downloads (GET /download/:filename) ---
    else if (req.url.startsWith('/download/') && req.method === 'GET') {
        console.log(`[SERVER] Matched: GET /download/*`);
        // Extract the filename from the URL
        const fileName = decodeURIComponent(req.url.split('/').pop());
        const filePath = path.join(UPLOAD_DIR, fileName);
        console.log(`[SERVER] Attempting to serve file: ${fileName} from ${filePath}`);

        // Check if the file exists
        fs.access(filePath, fs.constants.F_OK, (err) => {
            if (err) {
                console.error(`[SERVER] File not found: ${fileName}`, err);
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('File not found.');
                return;
            }

            // Set appropriate headers for file download
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream', // Generic binary file type
                'Content-Disposition': `attachment; filename="${fileName}"` // Force download with original filename
            });

            // Create a read stream from the file and pipe it to the response
            const fileStream = fs.createReadStream(filePath);
            fileStream.pipe(res);

            fileStream.on('error', (streamErr) => {
                console.error(`[SERVER] Error streaming file ${fileName}:`, streamErr);
                res.end('Error downloading file.');
            });
        });
    }

    // --- Serve static client.js file ---
    else if (req.url === '/client.js' && req.method === 'GET') {
        console.log('[SERVER] Matched: GET /client.js (Serving JavaScript)');
        const jsPath = path.join(__dirname, 'client.js');
        fs.readFile(jsPath, (err, data) => {
            if (err) {
                console.error('[SERVER] Error reading client.js:', err);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error: Could not load JavaScript file.');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/javascript' }); // Correct MIME type
            res.end(data);
        });
    }

    // --- Serve the static HTML client (GET / or anything else by default) ---
    else {
        console.log(`[SERVER] Matched: Fallback for ${req.url} (Serving client.html)`); // Log if fallback is hit
        const clientPath = path.join(__dirname, 'client.html'); // Assuming client.html is in the same directory

        fs.readFile(clientPath, (err, data) => {
            if (err) {
                console.error('[SERVER] Error reading client.html in fallback:', err);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('Internal Server Error: Could not load client page.');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(data);
        });
    }
});

const PORT = 3000; // Port on which the server will listen

// Start the server
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
    console.log('To access from another device on your local network, use your computer\'s IP address instead of localhost.');
    console.log('Example: http://192.168.1.X:3000/');
});

