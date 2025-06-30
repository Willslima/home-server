
const fileInput = document.getElementById('fileInput');
const uploadButton = document.getElementById('uploadButton');
const uploadStatus = document.getElementById('uploadStatus');
const fileListDiv = document.getElementById('fileList');
const refreshButton = document.getElementById('refreshButton');

const API_BASE_URL = window.location.origin;

function showStatus(message, isError = false) {
    uploadStatus.textContent = message;
    uploadStatus.className = `mt-4 text-center text-sm ${isError ? 'text-red-600' : 'text-green-600'}`;
}

// --- File Upload Logic ---
uploadButton.addEventListener('click', async () => {
    const file = fileInput.files[0];

    if (!file) {
        showStatus('Please select a file first.', true);
        return;
    }

    showStatus('Uploading file...', false);

    const formData = new FormData();
    formData.append('myFile', file);

    try {
        const response = await fetch(`${API_BASE_URL}/upload`, {
            method: 'POST',
            body: formData,
        });

        const result = await response.json();

        if (response.ok) {
            showStatus(`Upload successful: ${result.fileName}`, false);
            listFiles();
        } else {
            showStatus(`Upload failed: ${result.message || 'Unknown error'}`, true);
            console.error('Upload error:', result);
        }
    } catch (error) {
        showStatus(`Network error during upload: ${error.message}`, true);
        console.error('Fetch error during upload:', error);
    }
});

// --- File Listing Logic ---
async function listFiles() {
    fileListDiv.innerHTML = '<p class="text-center text-gray-500">Loading files...</p>';

    try {
        const response = await fetch(`${API_BASE_URL}/files`);
        const result = await response.json();

        if (response.ok && result.success) {
            if (result.files.length === 0) {
                fileListDiv.innerHTML = '<p class="text-center text-gray-500">No files uploaded yet.</p>';
            } else {
                fileListDiv.innerHTML = '';
                result.files.forEach(fileName => {
                    const fileItem = document.createElement('div');
                    fileItem.className = 'file-item';
                    fileItem.innerHTML = `
                        <span>${fileName}</span>
                        <div class="action-buttons">
                            <a href="${API_BASE_URL}/download/${encodeURIComponent(fileName)}" class="text-indigo-600 hover:underline">Download</a>
                            <button class="delete-btn" data-filename="${encodeURIComponent(fileName)}">Delete</button>
                        </div>
                    `;
                    fileListDiv.appendChild(fileItem);
                });

                document.querySelectorAll('.delete-btn').forEach(button => {
                    button.addEventListener('click', (event) => {
                        const fileNameToDelete = decodeURIComponent(event.target.dataset.filename);
                        // Using custom modal for confirmation instead of alert() or confirm()
                        showCustomConfirm(`Are you sure you want to delete "${fileNameToDelete}"?`, () => {
                            deleteFile(fileNameToDelete);
                        });
                    });
                });
            }
        } else {
            fileListDiv.innerHTML = `<p class="text-center text-red-600">Failed to load files: ${result.message || 'Unknown error'}</p>`;
            console.error('File listing error:', result);
        }
    } catch (error) {
        fileListDiv.innerHTML = `<p class="text-center text-red-600">Network error loading files: ${error.message}</p>`;
        console.error('Fetch error during file listing:', error);
    }
}

// --- File Deletion Logic ---
async function deleteFile(fileName) {
    showStatus(`Deleting "${fileName}"...`, false);
    try {
        const response = await fetch(`${API_BASE_URL}/delete/${encodeURIComponent(fileName)}`, {
            method: 'DELETE',
        });

        // IMPORTANT: Log the raw response text before attempting to parse as JSON
        const responseText = await response.text();
        console.log('Server response for DELETE:', responseText);

        let result;
        try {
            result = JSON.parse(responseText); // Attempt to parse
        } catch (jsonError) {
            console.error('JSON parsing error:', jsonError);
            showStatus(`Failed to delete "${fileName}": Server sent invalid JSON. Raw response: "${responseText.substring(0, 100)}"`, true);
            return; // Stop execution if JSON parsing fails
        }

        if (response.ok && result.success) {
            showStatus(`"${fileName}" deleted successfully.`, false);
            listFiles();
        } else {
            showStatus(`Failed to delete "${fileName}": ${result.message || 'Unknown error'}`, true);
            console.error('Delete error:', result);
        }
    } catch (error) {
        showStatus(`Network error during deletion of "${fileName}": ${error.message}`, true);
        console.error('Fetch error during deletion:', error);
    }
}

// --- Custom Confirmation Modal (replaces window.confirm) ---
function showCustomConfirm(message, onConfirm) {
    let modal = document.getElementById('customConfirmModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'customConfirmModal';
        modal.className = 'fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-50';
        modal.innerHTML = `
            <div class="bg-white rounded-lg p-6 shadow-xl max-w-sm w-full mx-4">
                <p class="text-lg font-semibold text-gray-800 mb-4" id="customConfirmMessage"></p>
                <div class="flex justify-end space-x-3">
                    <button id="customConfirmCancel" class="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300">Cancel</button>
                    <button id="customConfirmOK" class="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600">OK</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('customConfirmCancel').addEventListener('click', () => {
            modal.remove();
        });
        document.getElementById('customConfirmOK').addEventListener('click', () => {
            onConfirm();
            modal.remove();
        });
    }
    document.getElementById('customConfirmMessage').textContent = message;
    modal.style.display = 'flex'; // Show the modal
}

refreshButton.addEventListener('click', listFiles);
document.addEventListener('DOMContentLoaded', listFiles);
