const fileInput = document.getElementById('file-input');
const pdfContainer = document.getElementById('pdf-container');
const saveBtn = document.getElementById('save-btn');
const splitBtn = document.getElementById('split-btn');
const imageToPdfBtn = document.getElementById('image-to-pdf-btn');
const pdfToImageBtn = document.getElementById('pdf-to-image-btn');
const rotateBtn = document.getElementById('rotate-page-btn');
const rearrangePagesBtn = document.getElementById('rearrange-pages-btn');
const watermarkBtn = document.getElementById('watermark-btn');

let pdfDoc = null;
let pdfBytes = null;
let deletedPages = new Set(); // Track deleted pages
let rotations = {}; // Track rotation of each page
let pageOrder = []; // New variable to track the current order of pages
let watermarkText = ''; // Variable to store the watermark text

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.10.377/pdf.worker.min.js';

let pdfJsDoc = null;

// Handle PDF file input
fileInput.addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        pdfBytes = new Uint8Array(arrayBuffer);

        // Load the PDF using PDF-lib for editing
        pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);

        // Initialize page order
        pageOrder = Array.from({ length: pdfDoc.getPageCount() }, (_, i) => i);

        // Load and render the PDF using PDF.js for viewing
        const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
        pdfJsDoc = await loadingTask.promise;
        renderPDF();
    }
});

// Update the renderPDF function to account for the current page order
async function renderPDF() {
    pdfContainer.innerHTML = ''; // Clear previous PDF content

    const pageCount = pdfDoc.getPageCount();
    const newPageOrder = Array.from({ length: pageCount }, (_, i) => i); // Create an array of indices

    // Render each page in the new order
    for (let i = 0; i < newPageOrder.length; i++) {
        const pageIndex = newPageOrder[i]; // Get the index based on new order

        if (deletedPages.has(pageIndex)) continue; // Skip deleted pages

        const page = await pdfJsDoc.getPage(pageIndex + 1); // Get the page
        const rotation = rotations[pageIndex] || 0; // Get the rotation angle, default to 0
        const viewport = page.getViewport({ scale: 1.5, rotation });

        // Create a container for the page and delete button
        const pageContainer = document.createElement('div');
        pageContainer.classList.add('page-container');

        // Create canvas element to render the page
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');

        // Render the page into the canvas context
        const renderContext = {
            canvasContext: context,
            viewport: viewport
        };
        await page.render(renderContext).promise;

        // Draw watermark if it exists
        if (watermarkText) {
            const { width, height } = viewport;
            context.font = '50px Arial'; // Set font size
            context.fillStyle = 'rgba(0.75, 0.75, 0.75, 0.2)'; // More transparent watermark color
            context.textAlign = 'center'; // Center the text
            context.save(); // Save the current context state
            context.translate(width / 2, height / 2); // Move the origin to the center
            context.rotate(Math.PI / 4); // Rotate 45 degrees clockwise (adjust angle to 270 degrees)
            context.fillText(watermarkText, 0, 0); // Draw the watermark
            context.restore(); // Restore the context to its original state
        }


        // Create delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.innerText = 'Delete Page';
        deleteBtn.onclick = () => deletePage(pageIndex);

        // Add the canvas and button to the page container
        pageContainer.appendChild(canvas);
        pageContainer.appendChild(deleteBtn);
        pdfContainer.appendChild(pageContainer);
    }

    // Show the save button once PDF is rendered
    saveBtn.style.display = 'block';
}

// Mark page as deleted and re-render PDF
function deletePage(pageIndex) {
    deletedPages.add(pageIndex); // Mark page for deletion
    renderPDF(); // Re-render without the deleted page
}

// Save the modified PDF using PDF-lib
saveBtn.addEventListener('click', async () => {
    if (!pdfDoc) return;

    // Log all rotation values for debugging
    console.log('Rotation values before saving:', rotations);

    // Remove deleted pages and adjust rotations accordingly
    const pagesToRemove = [...deletedPages].sort((a, b) => b - a); // Sort in descending order
    for (const index of pagesToRemove) {
        pdfDoc.removePage(index);
        delete rotations[index]; // Remove the corresponding rotation entry
    }

    // Create a new PDF document for saving
    const newPdfDoc = await PDFLib.PDFDocument.create();

    const pageCount = pdfDoc.getPageCount();
    for (let i = 0; i < pageCount; i++) {
        if (deletedPages.has(i)) continue; // Skip deleted pages

        const [newPage] = await newPdfDoc.copyPages(pdfDoc, [i]);
        newPdfDoc.addPage(newPage); // Add the copied page

        // Add the watermark to the new page with consistent properties
        if (watermarkText) {
            const { width, height } = newPage.getSize();
            newPage.drawText(watermarkText, {
                x: width / 2,
                y: height / 2,
                size: 50,
                color: PDFLib.rgb(0.75, 0.75, 0.75), // Consistent watermark color
                opacity: 0.2, // Consistent transparency
                rotate: PDFLib.degrees(0), // Ensure 270-degree rotation
                anchor: 'middle-center' // Center the watermark
            });
        }
    }

    // Serialize the modified PDF to bytes
    try {
        const modifiedPdfBytes = await newPdfDoc.save();
        downloadPdf(modifiedPdfBytes, 'edited.pdf'); // Download the modified PDF
    } catch (error) {
        console.error('Error saving PDF:', error); // Log any errors encountered during saving
    }
});

// Helper function to download the PDF
function downloadPdf(modifiedPdfBytes, filename) {
    const blob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Split PDF functionality
splitBtn.addEventListener('click', async () => {
    if (!pdfDoc) return;

    const totalPages = pdfDoc.getPageCount();
    const startPage = parseInt(prompt(`Enter start page (1-${totalPages}):`));
    const endPage = parseInt(prompt(`Enter end page (1-${totalPages}):`));

    if (startPage && endPage && startPage <= endPage && startPage >= 1 && endPage <= totalPages) {
        const splitPdf = await PDFLib.PDFDocument.create();
        const pagesToCopy = pdfDoc.getPages().slice(startPage - 1, endPage); // Slice to get the pages

        for (const page of pagesToCopy) {
            const [copiedPage] = await splitPdf.copyPages(pdfDoc, [pdfDoc.getPages().indexOf(page)]);
            splitPdf.addPage(copiedPage);
        }

        const splitPdfBytes = await splitPdf.save();
        downloadPdf(splitPdfBytes, `split_${startPage}-${endPage}.pdf`);
    } else {
        alert('Invalid page range.');
    }
});

// Image to PDF functionality
imageToPdfBtn.addEventListener('click', async () => {
    const imageFileInput = document.createElement('input');
    imageFileInput.type = 'file';
    imageFileInput.accept = 'image/*';
    imageFileInput.multiple = true;

    imageFileInput.onchange = async (event) => {
        const files = event.target.files;
        if (files.length) {
            const imagePdfs = await Promise.all(Array.from(files).map(async (file) => {
                const imageBytes = await file.arrayBuffer();
                const imagePdf = await PDFLib.PDFDocument.create();
                const page = imagePdf.addPage([600, 800]); // Add a page with specified size
                const jpgImage = await imagePdf.embedJpg(imageBytes);
                const { width, height } = jpgImage.scale(1);
                page.drawImage(jpgImage, { x: 0, y: 0, width, height });

                return imagePdf.save();
            }));

            const combinedPdf = await PDFLib.PDFDocument.create();
            for (const imagePdfBytes of imagePdfs) {
                const imagePdf = await PDFLib.PDFDocument.load(imagePdfBytes);
                const pages = await combinedPdf.copyPages(imagePdf, imagePdf.getPageIndices());
                pages.forEach((page) => combinedPdf.addPage(page));
            }

            const combinedPdfBytes = await combinedPdf.save();
            downloadPdf(combinedPdfBytes, 'images_to_pdf.pdf');
        }
    };

    imageFileInput.click();
});

// PDF to image functionality
pdfToImageBtn.addEventListener('click', async () => {
    if (!pdfJsDoc) return;

    const pageCount = pdfJsDoc.numPages;
    for (let i = 1; i <= pageCount; i++) {
        const page = await pdfJsDoc.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const context = canvas.getContext('2d');
        const renderContext = {
            canvasContext: context,
            viewport: viewport,
        };
        await page.render(renderContext).promise;

        const imageUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = imageUrl;
        link.download = `page_${i}.png`;
        link.click();
    }
});

// Rotate pages functionality
rotateBtn.addEventListener('click', () => {
    const pageIndex = parseInt(prompt('Enter page number to rotate (1-' + pdfDoc.getPageCount() + '):')) - 1;
    const rotation = parseInt(prompt('Enter rotation angle (0, 90, 180, 270):'));

    if (pageIndex >= 0 && pageIndex < pdfDoc.getPageCount() && [0, 90, 180, 270].includes(rotation)) {
        rotations[pageIndex] = rotation; // Store the rotation
        renderPDF(); // Re-render the PDF to apply the rotation
    } else {
        alert('Invalid page number or rotation angle.');
    }
});

// Rearrange pages functionality
rearrangePagesBtn.addEventListener('click', () => {
    const newOrder = prompt('Enter new page order as comma-separated values (e.g., 3,1,2):');
    const orderArray = newOrder.split(',').map(Number).filter(num => !isNaN(num) && num > 0);

    if (orderArray.length === pdfDoc.getPageCount() && new Set(orderArray).size === orderArray.length) {
        pageOrder = orderArray.map(num => num - 1); // Convert to zero-based indexing
        renderPDF(); // Re-render with new page order
    } else {
        alert('Invalid page order. Ensure all page numbers are unique and within range.');
    }
});

// Watermark functionality
watermarkBtn.addEventListener('click', () => {
    const text = prompt('Enter watermark text:');
    if (text) {
        watermarkText = text; // Set the watermark text
        renderPDF(); // Re-render to apply the watermark
    }
});