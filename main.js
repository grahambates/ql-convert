// TODO:
// - show original dimensions / scale %

// DOM elements
let originalCanvas = document.getElementById('originalCanvas');
let originalCtx = originalCanvas.getContext('2d');
let convertedCanvas = document.getElementById('convertedCanvas');
let convertedCtx = convertedCanvas.getContext('2d');
let dropArea = document.getElementById('dropArea');
let fileInput = document.getElementById('imageInput');
let resizeWidthInput = document.getElementById('resizeWidth')
let resizeHeightInput = document.getElementById('resizeHeight')
let resizeModeInput = document.getElementById('resizeMode')

// Selected input image
let originalImage = null;

// Bayer matrices for ordered dithering
const bayerMatrices = {
  // 2x2 Bayer matrix
  '2x2': [
    [0 / 4, 2 / 4],
    [3 / 4, 1 / 4]
  ],

  // 4x4 Bayer matrix
  '4x4': [
    [0 / 16, 8 / 16, 2 / 16, 10 / 16],
    [12 / 16, 4 / 16, 14 / 16, 6 / 16],
    [3 / 16, 11 / 16, 1 / 16, 9 / 16],
    [15 / 16, 7 / 16, 13 / 16, 5 / 16]
  ],

  // 8x8 Bayer matrix
  '8x8': [
    [0 / 64, 32 / 64, 8 / 64, 40 / 64, 2 / 64, 34 / 64, 10 / 64, 42 / 64],
    [48 / 64, 16 / 64, 56 / 64, 24 / 64, 50 / 64, 18 / 64, 58 / 64, 26 / 64],
    [12 / 64, 44 / 64, 4 / 64, 36 / 64, 14 / 64, 46 / 64, 6 / 64, 38 / 64],
    [60 / 64, 28 / 64, 52 / 64, 20 / 64, 62 / 64, 30 / 64, 54 / 64, 22 / 64],
    [3 / 64, 35 / 64, 11 / 64, 43 / 64, 1 / 64, 33 / 64, 9 / 64, 41 / 64],
    [51 / 64, 19 / 64, 59 / 64, 27 / 64, 49 / 64, 17 / 64, 57 / 64, 25 / 64],
    [15 / 64, 47 / 64, 7 / 64, 39 / 64, 13 / 64, 45 / 64, 5 / 64, 37 / 64],
    [63 / 64, 31 / 64, 55 / 64, 23 / 64, 61 / 64, 29 / 64, 53 / 64, 21 / 64]
  ]
};

// Initialize UI elements
document.getElementById('threshold').addEventListener('input', function () {
  document.getElementById('thresholdValue').textContent = this.value;
});

document.getElementById('ditherAmount').addEventListener('input', function () {
  document.getElementById('ditherAmountValue').textContent = this.value;
});

document.getElementById('downloadPng').addEventListener('click', downloadPNG);
document.getElementById('downloadBinary').addEventListener('click', downloadBinary);

// Add auto-refresh triggers for all settings
document.getElementById('algorithm').addEventListener('change', update);
document.getElementById('threshold').addEventListener('input', update);
document.getElementById('ditherAmount').addEventListener('input', update);
document.getElementById('use2BitMode').addEventListener('change', update);  // Add event listener for 2-bit mode checkbox
resizeModeInput.addEventListener('change', update);
resizeWidthInput.addEventListener('input', update);
resizeHeightInput.addEventListener('input', update);

// Click on drop area to open file browser
dropArea.addEventListener('click', function () {
  fileInput.click();
});

// Handle file selection via input
fileInput.addEventListener('change', function (e) {
  loadImage(e.target.files[0]);
});

// Drag and drop events
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, function (e) {
    e.preventDefault();
    e.stopPropagation();
  }, false);
});

// Handle drag enter
dropArea.addEventListener('dragenter', function () {
  dropArea.classList.add('drag-active');
}, false);

// Handle drag over
dropArea.addEventListener('dragover', function () {
  dropArea.classList.add('drag-active');
}, false);

// Handle drag leave
dropArea.addEventListener('dragleave', function () {
  dropArea.classList.remove('drag-active');
}, false);

// Handle drop
dropArea.addEventListener('drop', function (e) {
  dropArea.classList.remove('drag-active');
  const dt = e.dataTransfer;
  const file = dt.files[0];
  loadImage(file);
}, false);

document.getElementById('inputForm').reset()

// Load the selected image
function loadImage(file) {
  if (!file) return;

  document.getElementById('placeholderText').style.display = 'none';

  const reader = new FileReader();
  reader.onload = function (event) {
    originalImage = new Image();
    originalImage.onload = function () {
      // Resize canvases to match image dimensions
      originalCanvas.width = originalImage.width;
      originalCanvas.height = originalImage.height;

      // Draw original image
      originalCtx.clearRect(0, 0, originalCanvas.width, originalCanvas.height);
      originalCtx.drawImage(originalImage, 0, 0);

      // Convert the image
      update();
    };
    originalImage.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

// Convert the image using selected algorithm
function update() {
  // Get conversion parameters
  const algorithm = document.getElementById('algorithm').value;
  const resizeMode = resizeModeInput.value;
  const threshold = parseInt(document.getElementById('threshold').value);
  const ditherAmount = parseFloat(document.getElementById('ditherAmount').value);
  const use2BitMode = document.getElementById('use2BitMode').checked;  // Get the state of 2-bit mode checkbox

  const isManual = resizeMode === 'manual';
  resizeWidthInput.disabled = !isManual;
  resizeHeightInput.disabled = !isManual;

  // Show dither slider for algorithms that use it
  const hasDither = ['floydSteinberg', 'atkinson', 'ordered2x2', 'ordered4x4', 'ordered8x8'].includes(algorithm);
  document.getElementById('ditherSlider').style.display = hasDither ? 'block' : 'none';

  if (!originalImage) {
    // No image loaded yet, nothing to convert
    return;
  }

  // Get target dimensions
  let targetWidth = originalImage.width;
  let targetHeight = originalImage.height;

  switch (resizeMode) {
    case 'auto': {
      let scale = 1
      targetWidth *= 3 / 4.4;
      if (targetWidth > targetHeight && targetWidth > 256) {
        scale = 256 / targetWidth;
      } else if (targetHeight > 256) {
        scale = 256 / targetHeight;
      }
      targetWidth = Math.floor(targetWidth * scale);
      targetHeight = Math.floor(targetHeight * scale);
      break;
    }
    case 'manual':
      // Manual size - use exact dimensions specified
      targetWidth = parseInt(resizeWidthInput.value);
      targetHeight = parseInt(resizeHeightInput.value);
      break;
  }

  resizeWidthInput.value = targetWidth;
  resizeHeightInput.value = targetHeight;

  // Resize target canvas
  convertedCanvas.width = targetWidth;
  convertedCanvas.height = targetHeight;
  // Adjust preview for approximate aspect ratio 4:3
  convertedCanvas.style.width = targetWidth * 4 + "px";
  convertedCanvas.style.height = targetHeight * 3 + "px";
  convertedCtx.clearRect(0, 0, convertedCanvas.width, convertedCanvas.height);

  // Draw the resized image
  convertedCtx.drawImage(originalImage, 0, 0, originalImage.width, originalImage.height,
    0, 0, targetWidth, targetHeight);

  // Get the image data for processing
  const imageData = convertedCtx.getImageData(0, 0, targetWidth, targetHeight);
  const pixels = imageData.data;

  // Create a new ImageData for the converted image
  const convertedImageData = new ImageData(targetWidth, targetHeight);
  const convertedPixels = convertedImageData.data;

  // Apply the selected conversion algorithm
  switch (algorithm) {
    case 'threshold':
      if (use2BitMode) {
        apply2BitThreshold(pixels, convertedPixels, threshold);
      } else {
        applyThreshold(pixels, convertedPixels, threshold);
      }
      break;
    case 'floydSteinberg':
      if (use2BitMode) {
        apply2BitFloydSteinberg(pixels, convertedPixels, threshold, targetWidth, targetHeight, ditherAmount);
      } else {
        applyFloydSteinberg(pixels, convertedPixels, threshold, targetWidth, targetHeight, ditherAmount);
      }
      break;
    case 'atkinson':
      if (use2BitMode) {
        apply2BitAtkinson(pixels, convertedPixels, threshold, targetWidth, targetHeight, ditherAmount);
      } else {
        applyAtkinson(pixels, convertedPixels, threshold, targetWidth, targetHeight, ditherAmount);
      }
      break;
    case 'ordered2x2':
      if (use2BitMode) {
        apply2BitOrderedDithering(pixels, convertedPixels, threshold, targetWidth, targetHeight, '2x2', ditherAmount);
      } else {
        applyOrderedDithering(pixels, convertedPixels, threshold, targetWidth, targetHeight, '2x2', ditherAmount);
      }
      break;
    case 'ordered4x4':
      if (use2BitMode) {
        apply2BitOrderedDithering(pixels, convertedPixels, threshold, targetWidth, targetHeight, '4x4', ditherAmount);
      } else {
        applyOrderedDithering(pixels, convertedPixels, threshold, targetWidth, targetHeight, '4x4', ditherAmount);
      }
      break;
    case 'ordered8x8':
      if (use2BitMode) {
        apply2BitOrderedDithering(pixels, convertedPixels, threshold, targetWidth, targetHeight, '8x8', ditherAmount);
      } else {
        applyOrderedDithering(pixels, convertedPixels, threshold, targetWidth, targetHeight, '8x8', ditherAmount);
      }
      break;
  }

  // Draw the converted image
  convertedCtx.putImageData(convertedImageData, 0, 0);

  // Show download section
  document.getElementById('output').style.display = 'block';
}

// Simple threshold algorithm (1-bit)
function applyThreshold(srcPixels, destPixels, threshold) {
  for (let i = 0; i < srcPixels.length; i += 4) {
    // Get RGB values
    const r = srcPixels[i];
    const g = srcPixels[i + 1];
    const b = srcPixels[i + 2];

    // Convert to 1-bit per channel
    const newR = r >= threshold ? 255 : 0;
    const newG = g >= threshold ? 255 : 0;
    const newB = b >= threshold ? 255 : 0;

    // Set the new pixel values
    destPixels[i] = newR;
    destPixels[i + 1] = newG;
    destPixels[i + 2] = newB;
    destPixels[i + 3] = 255; // Alpha is always 255
  }
}

// 2-bit threshold algorithm
function apply2BitThreshold(srcPixels, destPixels, threshold) {
  for (let i = 0; i < srcPixels.length; i += 4) {
    // Get RGB values
    const r = srcPixels[i];
    const g = srcPixels[i + 1];
    const b = srcPixels[i + 2];

    // Convert to 2-bit per channel (4 possible values: 0, 85, 170, 255)
    destPixels[i] = convert2Bit(r, threshold);     // Red
    destPixels[i + 1] = convert2Bit(g, threshold); // Green
    destPixels[i + 2] = convert2Bit(b, threshold); // Blue
    destPixels[i + 3] = 255;                       // Alpha is always 255
  }
}

// Helper function to convert a value to 2-bit (4 levels)
function convert2Bit(value, threshold) {
  // Map to 4 levels (0, 85, 170, 255)
  if (value < threshold / 3) {
    return 0;
  } else if (value < threshold) {
    return 85;
  } else if (value < threshold + (255 - threshold) / 2) {
    return 170;
  } else {
    return 255;
  }
}

// Floyd-Steinberg dithering algorithm (1-bit)
function applyFloydSteinberg(srcPixels, destPixels, threshold, width, height, ditherAmount) {
  // Create a copy of the source pixels to work with
  const tempPixels = new Uint8ClampedArray(srcPixels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      // Process each color channel separately
      for (let c = 0; c < 3; c++) {
        const oldPixel = tempPixels[i + c];
        const newPixel = oldPixel >= threshold ? 255 : 0;
        const error = (oldPixel - newPixel) * ditherAmount;

        destPixels[i + c] = newPixel;

        // Distribute the error to neighboring pixels
        if (x + 1 < width) {
          tempPixels[i + 4 + c] += error * 7 / 16;
        }
        if (y + 1 < height) {
          if (x > 0) {
            tempPixels[i + 4 * (width - 1) + c] += error * 3 / 16;
          }
          tempPixels[i + 4 * width + c] += error * 5 / 16;
          if (x + 1 < width) {
            tempPixels[i + 4 * (width + 1) + c] += error * 1 / 16;
          }
        }
      }

      // Alpha channel is always 255
      destPixels[i + 3] = 255;
    }
  }
}

// Floyd-Steinberg dithering algorithm with 2-bit support
function apply2BitFloydSteinberg(srcPixels, destPixels, threshold, width, height, ditherAmount) {
  // Create a copy of the source pixels to work with
  const tempPixels = new Uint8ClampedArray(srcPixels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      // Process each color channel separately
      for (let c = 0; c < 3; c++) {
        const oldPixel = tempPixels[i + c];

        // Find the closest of the 4 possible 2-bit values
        let newPixel;
        if (oldPixel < 43) {
          newPixel = 0;
        } else if (oldPixel < 128) {
          newPixel = 85;
        } else if (oldPixel < 213) {
          newPixel = 170;
        } else {
          newPixel = 255;
        }

        const error = (oldPixel - newPixel) * ditherAmount;

        destPixels[i + c] = newPixel;

        // Distribute the error to neighboring pixels
        if (x + 1 < width) {
          tempPixels[i + 4 + c] += error * 7 / 16;
        }
        if (y + 1 < height) {
          if (x > 0) {
            tempPixels[i + 4 * (width - 1) + c] += error * 3 / 16;
          }
          tempPixels[i + 4 * width + c] += error * 5 / 16;
          if (x + 1 < width) {
            tempPixels[i + 4 * (width + 1) + c] += error * 1 / 16;
          }
        }
      }

      // Alpha channel is always 255
      destPixels[i + 3] = 255;
    }
  }
}

// Atkinson dithering algorithm (1-bit)
function applyAtkinson(srcPixels, destPixels, threshold, width, height, ditherAmount) {
  // Create a copy of the source pixels to work with
  const tempPixels = new Uint8ClampedArray(srcPixels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      // Process each color channel separately
      for (let c = 0; c < 3; c++) {
        const oldPixel = tempPixels[i + c];
        const newPixel = oldPixel >= threshold ? 255 : 0;
        const error = Math.floor(((oldPixel - newPixel) * ditherAmount) / 8);

        destPixels[i + c] = newPixel;

        // Distribute the error to neighboring pixels (Atkinson pattern)
        if (x + 1 < width) {
          tempPixels[i + 4 + c] += error;
        }
        if (x + 2 < width) {
          tempPixels[i + 8 + c] += error;
        }
        if (y + 1 < height) {
          tempPixels[i + 4 * width + c] += error;
          if (x - 1 >= 0) {
            tempPixels[i + 4 * (width - 1) + c] += error;
          }
          if (x + 1 < width) {
            tempPixels[i + 4 * (width + 1) + c] += error;
          }
        }
        if (y + 2 < height) {
          tempPixels[i + 8 * width + c] += error;
        }
      }

      // Alpha channel is always 255
      destPixels[i + 3] = 255;
    }
  }
}

// Atkinson dithering algorithm with 2-bit support
function apply2BitAtkinson(srcPixels, destPixels, threshold, width, height, ditherAmount) {
  // Create a copy of the source pixels to work with
  const tempPixels = new Uint8ClampedArray(srcPixels);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      // Process each color channel separately
      for (let c = 0; c < 3; c++) {
        const oldPixel = tempPixels[i + c];

        // Find the closest of the 4 possible 2-bit values
        let newPixel;
        if (oldPixel < 43) {
          newPixel = 0;
        } else if (oldPixel < 128) {
          newPixel = 85;
        } else if (oldPixel < 213) {
          newPixel = 170;
        } else {
          newPixel = 255;
        }

        const error = Math.floor(((oldPixel - newPixel) * ditherAmount) / 8);

        destPixels[i + c] = newPixel;

        // Distribute the error to neighboring pixels (Atkinson pattern)
        if (x + 1 < width) {
          tempPixels[i + 4 + c] += error;
        }
        if (x + 2 < width) {
          tempPixels[i + 8 + c] += error;
        }
        if (y + 1 < height) {
          tempPixels[i + 4 * width + c] += error;
          if (x - 1 >= 0) {
            tempPixels[i + 4 * (width - 1) + c] += error;
          }
          if (x + 1 < width) {
            tempPixels[i + 4 * (width + 1) + c] += error;
          }
        }
        if (y + 2 < height) {
          tempPixels[i + 8 * width + c] += error;
        }
      }

      // Alpha channel is always 255
      destPixels[i + 3] = 255;
    }
  }
}

// Ordered dithering algorithm with Bayer matrices (1-bit)
function applyOrderedDithering(srcPixels, destPixels, threshold, width, height, matrixSize, ditherAmount) {
  const matrix = bayerMatrices[matrixSize];
  const matrixWidth = matrix[0].length;
  const matrixHeight = matrix.length;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      // Get matrix position
      const matrixX = x % matrixWidth;
      const matrixY = y % matrixHeight;

      // Get threshold adjustment from Bayer matrix
      // Scale it to match the threshold range (0-255)
      // Use ditherAmount to control the strength of the dithering pattern
      const thresholdModifier = Math.floor(matrix[matrixY][matrixX] * 255 * ditherAmount);

      // Calculate adjusted threshold value using the base threshold and the modifier
      const adjustedThreshold = Math.max(0, Math.min(255, threshold - thresholdModifier));

      // Process each color channel separately
      for (let c = 0; c < 3; c++) {
        const oldPixel = srcPixels[i + c];
        // Compare the pixel value with adjusted threshold
        destPixels[i + c] = oldPixel >= adjustedThreshold ? 255 : 0;
      }

      // Alpha channel is always 255
      destPixels[i + 3] = 255;
    }
  }
}

// Ordered dithering algorithm with Bayer matrices and 2-bit support
function apply2BitOrderedDithering(srcPixels, destPixels, threshold, width, height, matrixSize, ditherAmount) {
  const matrix = bayerMatrices[matrixSize];
  const matrixWidth = matrix[0].length;
  const matrixHeight = matrix.length;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      // Get matrix position
      const matrixX = x % matrixWidth;
      const matrixY = y % matrixHeight;

      // Get threshold adjustment from Bayer matrix (scaled down for 2-bit)
      const thresholdModifier = Math.floor(matrix[matrixY][matrixX] * 85 * ditherAmount);

      // Process each color channel separately
      for (let c = 0; c < 3; c++) {
        const oldPixel = srcPixels[i + c];

        // Apply the threshold modifier differently for 2-bit color
        if (oldPixel < Math.max(0, Math.min(85, 43 - thresholdModifier))) {
          destPixels[i + c] = 0;
        } else if (oldPixel < Math.max(0, Math.min(170, 128 - thresholdModifier))) {
          destPixels[i + c] = 85;
        } else if (oldPixel < Math.max(0, Math.min(255, 213 - thresholdModifier))) {
          destPixels[i + c] = 170;
        } else {
          destPixels[i + c] = 255;
        }
      }

      // Alpha channel is always 255
      destPixels[i + 3] = 255;
    }
  }
}

// Download the converted image as PNG
function downloadPNG() {
  if (!originalImage) return;

  const link = document.createElement('a');
  link.download = 'sinclair_ql_converted.png';
  link.href = convertedCanvas.toDataURL('image/png');
  link.click();
}

// Download the converted image as binary data
function downloadBinary() {
  if (!originalImage) return;

  // Get the image data
  const imageData = convertedCtx.getImageData(0, 0, convertedCanvas.width, convertedCanvas.height);
  const pixels = imageData.data;
  const use2BitMode = document.getElementById('use2BitMode').checked;

  // Create binary data specifically for Sinclair QL format
  // This is a simplified version - actual QL format would need more specific conversion
  const width = convertedCanvas.width;
  const height = convertedCanvas.height;
  const bytesPerRow = Math.ceil(width / 8);
  const binaryData = new Uint8Array(bytesPerRow * height * 3); // 3 color planes

  if (!use2BitMode) {
    // 1-bit mode - convert to binary format
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = (y * width + x) * 4;
        const byteIndex = Math.floor(x / 8);
        const bitIndex = 7 - (x % 8); // MSB first
        const bitValue = 1 << bitIndex;

        // Red plane
        if (pixels[pixelIndex] >= 128) {
          binaryData[y * bytesPerRow + byteIndex] |= bitValue;
        }

        // Green plane
        if (pixels[pixelIndex + 1] >= 128) {
          binaryData[bytesPerRow * height + y * bytesPerRow + byteIndex] |= bitValue;
        }

        // Blue plane
        if (pixels[pixelIndex + 2] >= 128) {
          binaryData[2 * bytesPerRow * height + y * bytesPerRow + byteIndex] |= bitValue;
        }
      }
    }
  } else {
    // 2-bit mode - requires more complex encoding
    // For 2-bit per channel, we need to use 2 bits per pixel per color plane
    // This is a simplified approach - actual implementation would depend on 
    // the specific requirements of the Sinclair QL format

    // Clear the binary data first
    binaryData.fill(0);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = (y * width + x) * 4;

        // For each color, determine the 2-bit value (0-3)
        const redValue = pixels[pixelIndex] === 0 ? 0 :
          pixels[pixelIndex] === 85 ? 1 :
            pixels[pixelIndex] === 170 ? 2 : 3;

        const greenValue = pixels[pixelIndex + 1] === 0 ? 0 :
          pixels[pixelIndex + 1] === 85 ? 1 :
            pixels[pixelIndex + 1] === 170 ? 2 : 3;

        const blueValue = pixels[pixelIndex + 2] === 0 ? 0 :
          pixels[pixelIndex + 2] === 85 ? 1 :
            pixels[pixelIndex + 2] === 170 ? 2 : 3;

        // Calculate position in the binary array
        // Each byte holds 4 pixels (2 bits per pixel)
        const byteIndex = Math.floor(x / 4);
        const bitPosition = 6 - (x % 4) * 2; // Position of the 2 bits within the byte (MSB first)

        // Set the bits for each color plane
        // Red plane
        binaryData[y * bytesPerRow + byteIndex] |= (redValue << bitPosition);

        // Green plane
        binaryData[bytesPerRow * height + y * bytesPerRow + byteIndex] |= (greenValue << bitPosition);

        // Blue plane
        binaryData[2 * bytesPerRow * height + y * bytesPerRow + byteIndex] |= (blueValue << bitPosition);
      }
    }
  }

  // Create a blob and download
  const blob = new Blob([binaryData], { type: 'application/octet-stream' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'sinclair_ql_data.bin';
  link.click();
}
