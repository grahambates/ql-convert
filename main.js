// TODO:
// - show original dimensions / scale %
// - Downloads for flicker mode

// DOM elements
let originalCanvas = document.getElementById("originalCanvas");
let originalCtx = originalCanvas.getContext("2d");
let convertedCanvas = document.getElementById("convertedCanvas");
let convertedCtx = convertedCanvas.getContext("2d");
let dropArea = document.getElementById("dropArea");
let fileInput = document.getElementById("imageInput");
let resizeWidthInput = document.getElementById("resizeWidth");
let resizeHeightInput = document.getElementById("resizeHeight");
let resizeModeInput = document.getElementById("resizeMode");

// Selected input image
let originalImage = null;

// Bayer matrices for ordered dithering
const bayerMatrices = {
  // 2x2 Bayer matrix
  "2x2": [
    [0 / 4, 2 / 4],
    [3 / 4, 1 / 4],
  ],

  // 4x4 Bayer matrix
  "4x4": [
    [0 / 16, 8 / 16, 2 / 16, 10 / 16],
    [12 / 16, 4 / 16, 14 / 16, 6 / 16],
    [3 / 16, 11 / 16, 1 / 16, 9 / 16],
    [15 / 16, 7 / 16, 13 / 16, 5 / 16],
  ],

  // 8x8 Bayer matrix
  "8x8": [
    [0 / 64, 32 / 64, 8 / 64, 40 / 64, 2 / 64, 34 / 64, 10 / 64, 42 / 64],
    [48 / 64, 16 / 64, 56 / 64, 24 / 64, 50 / 64, 18 / 64, 58 / 64, 26 / 64],
    [12 / 64, 44 / 64, 4 / 64, 36 / 64, 14 / 64, 46 / 64, 6 / 64, 38 / 64],
    [60 / 64, 28 / 64, 52 / 64, 20 / 64, 62 / 64, 30 / 64, 54 / 64, 22 / 64],
    [3 / 64, 35 / 64, 11 / 64, 43 / 64, 1 / 64, 33 / 64, 9 / 64, 41 / 64],
    [51 / 64, 19 / 64, 59 / 64, 27 / 64, 49 / 64, 17 / 64, 57 / 64, 25 / 64],
    [15 / 64, 47 / 64, 7 / 64, 39 / 64, 13 / 64, 45 / 64, 5 / 64, 37 / 64],
    [63 / 64, 31 / 64, 55 / 64, 23 / 64, 61 / 64, 29 / 64, 53 / 64, 21 / 64],
  ],
};

// Initialize UI elements
document.getElementById("threshold").addEventListener("input", function () {
  document.getElementById("thresholdValue").textContent = this.value;
});

document.getElementById("ditherAmount").addEventListener("input", function () {
  document.getElementById("ditherAmountValue").textContent = this.value;
});

document.getElementById("downloadPng").addEventListener("click", downloadPNG);
document
  .getElementById("downloadSource")
  .addEventListener("click", downloadSource);
document
  .getElementById("downloadBinary")
  .addEventListener("click", downloadBinary);

// Add auto-refresh triggers for all settings
document.getElementById("algorithm").addEventListener("change", update);
document.getElementById("threshold").addEventListener("input", update);
document.getElementById("ditherAmount").addEventListener("input", update);
document.getElementById("use2BitMode").addEventListener("change", update); // Add event listener for 2-bit mode checkbox
resizeModeInput.addEventListener("change", update);
resizeWidthInput.addEventListener("input", update);
resizeHeightInput.addEventListener("input", update);

// Click on drop area to open file browser
dropArea.addEventListener("click", function () {
  fileInput.click();
});

// Handle file selection via input
fileInput.addEventListener("change", function (e) {
  loadImage(e.target.files[0]);
});

// Drag and drop events
["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  dropArea.addEventListener(
    eventName,
    function (e) {
      e.preventDefault();
      e.stopPropagation();
    },
    false,
  );
});

// Handle drag enter
dropArea.addEventListener(
  "dragenter",
  function () {
    dropArea.classList.add("drag-active");
  },
  false,
);

// Handle drag over
dropArea.addEventListener(
  "dragover",
  function () {
    dropArea.classList.add("drag-active");
  },
  false,
);

// Handle drag leave
dropArea.addEventListener(
  "dragleave",
  function () {
    dropArea.classList.remove("drag-active");
  },
  false,
);

// Handle drop
dropArea.addEventListener(
  "drop",
  function (e) {
    dropArea.classList.remove("drag-active");
    const dt = e.dataTransfer;
    const file = dt.files[0];
    loadImage(file);
  },
  false,
);

document.getElementById("inputForm").reset();

// Load the selected image
function loadImage(file) {
  if (!file) return;

  document.getElementById("placeholderText").style.display = "none";

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
  const algorithm = document.getElementById("algorithm").value;
  const resizeMode = resizeModeInput.value;
  const threshold = parseInt(document.getElementById("threshold").value);
  const ditherAmount = parseFloat(
    document.getElementById("ditherAmount").value,
  );
  const use2BitMode = document.getElementById("use2BitMode").checked; // Get the state of 2-bit mode checkbox

  const isManual = resizeMode === "manual";
  resizeWidthInput.disabled = !isManual;
  resizeHeightInput.disabled = !isManual;

  // Show dither slider for algorithms that use it
  const hasDither = [
    "floydSteinberg",
    "atkinson",
    "ordered2x2",
    "ordered4x4",
    "ordered8x8",
  ].includes(algorithm);
  document.getElementById("ditherSlider").style.display = hasDither
    ? "block"
    : "none";

  if (!originalImage) {
    // No image loaded yet, nothing to convert
    return;
  }

  // Get target dimensions
  let targetWidth = originalImage.width;
  let targetHeight = originalImage.height;

  switch (resizeMode) {
    case "auto": {
      let scale = 1;
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
    case "manual":
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
  convertedCtx.drawImage(
    originalImage,
    0,
    0,
    originalImage.width,
    originalImage.height,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  // Get the image data for processing
  const imageData = convertedCtx.getImageData(0, 0, targetWidth, targetHeight);
  const pixels = imageData.data;

  // Create a new ImageData for the converted image
  const convertedImageData = new ImageData(targetWidth, targetHeight);
  const convertedPixels = convertedImageData.data;

  // Apply the selected conversion algorithm
  switch (algorithm) {
    case "threshold":
      if (use2BitMode) {
        apply2BitThreshold(pixels, convertedPixels, threshold);
      } else {
        applyThreshold(pixels, convertedPixels, threshold);
      }
      break;
    case "floydSteinberg":
      if (use2BitMode) {
        apply2BitFloydSteinberg(
          pixels,
          convertedPixels,
          threshold,
          targetWidth,
          targetHeight,
          ditherAmount,
        );
      } else {
        applyFloydSteinberg(
          pixels,
          convertedPixels,
          threshold,
          targetWidth,
          targetHeight,
          ditherAmount,
        );
      }
      break;
    case "atkinson":
      if (use2BitMode) {
        apply2BitAtkinson(
          pixels,
          convertedPixels,
          threshold,
          targetWidth,
          targetHeight,
          ditherAmount,
        );
      } else {
        applyAtkinson(
          pixels,
          convertedPixels,
          threshold,
          targetWidth,
          targetHeight,
          ditherAmount,
        );
      }
      break;
    case "ordered2x2":
      if (use2BitMode) {
        apply2BitOrderedDithering(
          pixels,
          convertedPixels,
          threshold,
          targetWidth,
          targetHeight,
          "2x2",
          ditherAmount,
        );
      } else {
        applyOrderedDithering(
          pixels,
          convertedPixels,
          threshold,
          targetWidth,
          targetHeight,
          "2x2",
          ditherAmount,
        );
      }
      break;
    case "ordered4x4":
      if (use2BitMode) {
        apply2BitOrderedDithering(
          pixels,
          convertedPixels,
          threshold,
          targetWidth,
          targetHeight,
          "4x4",
          ditherAmount,
        );
      } else {
        applyOrderedDithering(
          pixels,
          convertedPixels,
          threshold,
          targetWidth,
          targetHeight,
          "4x4",
          ditherAmount,
        );
      }
      break;
    case "ordered8x8":
      if (use2BitMode) {
        apply2BitOrderedDithering(
          pixels,
          convertedPixels,
          threshold,
          targetWidth,
          targetHeight,
          "8x8",
          ditherAmount,
        );
      } else {
        applyOrderedDithering(
          pixels,
          convertedPixels,
          threshold,
          targetWidth,
          targetHeight,
          "8x8",
          ditherAmount,
        );
      }
      break;
  }

  // Draw the converted image
  convertedCtx.putImageData(convertedImageData, 0, 0);

  // Show download section
  document.getElementById("output").style.display = "block";
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
  // Calculate level boundaries based on threshold
  // Threshold controls the midpoint between darker and lighter colors
  const darkCutoff = Math.max(0, Math.min(127, threshold / 2)); // Boundary between level 0 and 1
  const midCutoff = threshold; // Boundary between level 1 and 2
  const brightCutoff = Math.min(255, threshold + (255 - threshold) / 2); // Boundary between level 2 and 3

  for (let i = 0; i < srcPixels.length; i += 4) {
    // Get RGB values
    const r = srcPixels[i];
    const g = srcPixels[i + 1];
    const b = srcPixels[i + 2];

    // Convert to 2-bit per channel with dynamic boundaries based on threshold
    // Red channel
    if (r < darkCutoff) {
      destPixels[i] = 0;
    } else if (r < midCutoff) {
      destPixels[i] = 85;
    } else if (r < brightCutoff) {
      destPixels[i] = 170;
    } else {
      destPixels[i] = 255;
    }

    // Green channel
    if (g < darkCutoff) {
      destPixels[i + 1] = 0;
    } else if (g < midCutoff) {
      destPixels[i + 1] = 85;
    } else if (g < brightCutoff) {
      destPixels[i + 1] = 170;
    } else {
      destPixels[i + 1] = 255;
    }

    // Blue channel
    if (b < darkCutoff) {
      destPixels[i + 2] = 0;
    } else if (b < midCutoff) {
      destPixels[i + 2] = 85;
    } else if (b < brightCutoff) {
      destPixels[i + 2] = 170;
    } else {
      destPixels[i + 2] = 255;
    }

    // Alpha is always 255
    destPixels[i + 3] = 255;
  }
}

// Helper function to convert a value to 2-bit (4 levels)
function convert2Bit(value, threshold) {
  // Adjust threshold to work better with 2-bit mode
  // The threshold parameter now controls the overall brightness/contrast
  const adjustedThreshold = threshold / 2;

  // Map to 4 levels (0, 85, 170, 255) with the threshold affecting the distribution
  if (value < adjustedThreshold) {
    // For darker pixels, split based on if they're very dark or moderately dark
    return value < adjustedThreshold / 2 ? 0 : 85;
  } else {
    // For brighter pixels, split based on if they're very bright or moderately bright
    return value < 128 + adjustedThreshold / 2 ? 170 : 255;
  }
}

// Floyd-Steinberg dithering algorithm (1-bit)
function applyFloydSteinberg(
  srcPixels,
  destPixels,
  threshold,
  width,
  height,
  ditherAmount,
) {
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
          tempPixels[i + 4 + c] += (error * 7) / 16;
        }
        if (y + 1 < height) {
          if (x > 0) {
            tempPixels[i + 4 * (width - 1) + c] += (error * 3) / 16;
          }
          tempPixels[i + 4 * width + c] += (error * 5) / 16;
          if (x + 1 < width) {
            tempPixels[i + 4 * (width + 1) + c] += (error * 1) / 16;
          }
        }
      }

      // Alpha channel is always 255
      destPixels[i + 3] = 255;
    }
  }
}

// Floyd-Steinberg dithering algorithm with 2-bit support
function apply2BitFloydSteinberg(
  srcPixels,
  destPixels,
  threshold,
  width,
  height,
  ditherAmount,
) {
  // Create a copy of the source pixels to work with
  const tempPixels = new Uint8ClampedArray(srcPixels);

  // Calculate level boundaries based on threshold
  const darkCutoff = Math.max(0, Math.min(127, threshold / 2));
  const midCutoff = threshold;
  const brightCutoff = Math.min(255, threshold + (255 - threshold) / 2);

  // Color values for 2-bit mode
  const colorLevels = [0, 85, 170, 255];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      // Process each color channel separately
      for (let c = 0; c < 3; c++) {
        const oldPixel = tempPixels[i + c];

        // Find the closest of the 4 possible 2-bit values
        let newPixel;
        if (oldPixel < darkCutoff) {
          newPixel = colorLevels[0]; // 0
        } else if (oldPixel < midCutoff) {
          newPixel = colorLevels[1]; // 85
        } else if (oldPixel < brightCutoff) {
          newPixel = colorLevels[2]; // 170
        } else {
          newPixel = colorLevels[3]; // 255
        }

        const error = (oldPixel - newPixel) * ditherAmount;

        destPixels[i + c] = newPixel;

        // Distribute the error to neighboring pixels
        if (x + 1 < width) {
          tempPixels[i + 4 + c] += (error * 7) / 16;
        }
        if (y + 1 < height) {
          if (x > 0) {
            tempPixels[i + 4 * (width - 1) + c] += (error * 3) / 16;
          }
          tempPixels[i + 4 * width + c] += (error * 5) / 16;
          if (x + 1 < width) {
            tempPixels[i + 4 * (width + 1) + c] += (error * 1) / 16;
          }
        }
      }

      // Alpha channel is always 255
      destPixels[i + 3] = 255;
    }
  }
}

// Atkinson dithering algorithm (1-bit)
function applyAtkinson(
  srcPixels,
  destPixels,
  threshold,
  width,
  height,
  ditherAmount,
) {
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
function apply2BitAtkinson(
  srcPixels,
  destPixels,
  threshold,
  width,
  height,
  ditherAmount,
) {
  // Create a copy of the source pixels to work with
  const tempPixels = new Uint8ClampedArray(srcPixels);

  // Calculate level boundaries based on threshold
  const darkCutoff = Math.max(0, Math.min(127, threshold / 2));
  const midCutoff = threshold;
  const brightCutoff = Math.min(255, threshold + (255 - threshold) / 2);

  // Color values for 2-bit mode
  const colorLevels = [0, 85, 170, 255];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      // Process each color channel separately
      for (let c = 0; c < 3; c++) {
        const oldPixel = tempPixels[i + c];

        // Find the closest of the 4 possible 2-bit values based on threshold
        let newPixel;
        if (oldPixel < darkCutoff) {
          newPixel = colorLevels[0]; // 0
        } else if (oldPixel < midCutoff) {
          newPixel = colorLevels[1]; // 85
        } else if (oldPixel < brightCutoff) {
          newPixel = colorLevels[2]; // 170
        } else {
          newPixel = colorLevels[3]; // 255
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
function applyOrderedDithering(
  srcPixels,
  destPixels,
  threshold,
  width,
  height,
  matrixSize,
  ditherAmount,
) {
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
      const thresholdModifier = Math.floor(
        matrix[matrixY][matrixX] * 255 * ditherAmount,
      );

      // Calculate adjusted threshold value using the base threshold and the modifier
      const adjustedThreshold = Math.max(
        0,
        Math.min(255, threshold - thresholdModifier),
      );

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
function apply2BitOrderedDithering(
  srcPixels,
  destPixels,
  threshold,
  width,
  height,
  matrixSize,
  ditherAmount,
) {
  const matrix = bayerMatrices[matrixSize];
  const matrixWidth = matrix[0].length;
  const matrixHeight = matrix.length;

  // Calculate level boundaries based on threshold
  const darkCutoff = Math.max(0, Math.min(127, threshold / 2));
  const midCutoff = threshold;
  const brightCutoff = Math.min(255, threshold + (255 - threshold) / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;

      // Get matrix position
      const matrixX = x % matrixWidth;
      const matrixY = y % matrixHeight;

      // Get threshold adjustment from Bayer matrix
      // Scale it to create a noticeable effect in 2-bit mode
      const thresholdModifier = Math.floor(
        matrix[matrixY][matrixX] * 85 * ditherAmount,
      );

      // Adjust the cutoffs with the dithering pattern
      const adjustedDarkCutoff = Math.max(
        0,
        Math.min(255, darkCutoff - thresholdModifier),
      );
      const adjustedMidCutoff = Math.max(
        0,
        Math.min(255, midCutoff - thresholdModifier),
      );
      const adjustedBrightCutoff = Math.max(
        0,
        Math.min(255, brightCutoff - thresholdModifier),
      );

      // Process each color channel separately
      for (let c = 0; c < 3; c++) {
        const oldPixel = srcPixels[i + c];

        // Apply the adjusted thresholds for better 2-bit dithering
        if (oldPixel < adjustedDarkCutoff) {
          destPixels[i + c] = 0;
        } else if (oldPixel < adjustedMidCutoff) {
          destPixels[i + c] = 85;
        } else if (oldPixel < adjustedBrightCutoff) {
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

  const link = document.createElement("a");
  link.download = "sinclair_ql_converted.png";
  link.href = convertedCanvas.toDataURL("image/png");
  link.click();
}

// Download the converted image as binary data
function downloadBinary() {
  if (!originalImage) return;

  const binaryData = convertToBin(convertedCanvas);
  const blob = new Blob([binaryData], { type: "application/octet-stream" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "image.bin";
  link.click();
  URL.revokeObjectURL(link.href);
}

function downloadSource() {
  if (!originalImage) return;

  const data = convertToSource(convertedCanvas);
  const blob = new Blob([data], { type: "text/plain" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "image.i";
  link.click();
  URL.revokeObjectURL(link.href);
}

function convertToBin(canvas, twoPlan = true) {
  const width = canvas.width;
  const height = canvas.height;
  const imageData = canvas.getContext("2d").getImageData(0, 0, width, height);
  const pixels = imageData.data;

  const bytesPerRow = twoPlan ? (width / 4) * 2 : width / 4;
  const totalBytes = height * bytesPerRow;
  const binaryData = new Uint8Array(totalBytes);
  let o = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x += 4) {
      let bit1 = 1 << 7;
      let bit2 = 1 << 6;
      let byte1 = 0;
      let byte2 = 0;
      for (let i = 0; i < 4; i++) {
        const offset = (y * width + x + i) * 4;
        const r = pixels[offset + 0];
        const g = pixels[offset + 1];
        const b = pixels[offset + 2];
        // GFGFGFGF RBRBRBRB
        if (g > 127) {
          byte1 += bit1;
        }
        if (r > 127) {
          byte2 += bit1;
        }
        if (b > 127) {
          byte2 += bit2;
        }
        bit1 >>= 2;
        bit2 >>= 2;
      }
      if (twoPlan) {
        binaryData[o++] = byte1;
      }
      binaryData[o++] = byte2;
    }
  }
  return binaryData;
}

function convertToSource(canvas, twoPlan = true) {
  const width = canvas.width;
  const height = canvas.height;
  const imageData = canvas.getContext("2d").getImageData(0, 0, width, height);
  const pixels = imageData.data;

  let output = "; Height: " + height + "\n";
  output += "; Width: " + width + "\n";

  // Check if width is divisible by 4
  if (width % 4 !== 0) {
    output += "; Width is not %4; exiting...\n";
    return output;
  }

  // Color mapping (same as in PHP)
  const bitList = [
    ["00", "00"], // 0: black
    ["00", "01"], // 1: blue
    ["00", "10"], // 2: red
    ["00", "11"], // 3: magenta
    ["10", "00"], // 4: green
    ["10", "01"], // 5: cyan
    ["10", "10"], // 6: yellow
    ["10", "11"], // 7: white
  ];

  // Process pixels
  const res = [];

  for (let y = 0; y < height; y++) {
    const line = [];

    for (let x = 0; x < width; x += 4) {
      let byte1 = "";
      let byte2 = "";

      // Get color values for 4 consecutive pixels
      // In canvas, each pixel has 4 values (R,G,B,A), we need to convert to our color index
      const colors = [];

      for (let i = 0; i < 4; i++) {
        const pixelIndex = (y * width + (x + i)) * 4;
        const r = pixels[pixelIndex];
        const g = pixels[pixelIndex + 1];
        const b = pixels[pixelIndex + 2];

        // Convert RGB to our color index (0-7)
        // This is a simple conversion - you might need a more sophisticated one
        let colorIndex = 0;

        // This is a simplified color mapping based on the PHP code's assumption
        // Black (0)
        if (r < 85 && g < 85 && b < 85) colorIndex = 0;
        // Blue (1)
        else if (r < 85 && g < 85 && b >= 85) colorIndex = 1;
        // Red (2)
        else if (r >= 85 && g < 85 && b < 85) colorIndex = 2;
        // Magenta (3)
        else if (r >= 85 && g < 85 && b >= 85) colorIndex = 3;
        // Green (4)
        else if (r < 85 && g >= 85 && b < 85) colorIndex = 4;
        // Cyan (5)
        else if (r < 85 && g >= 85 && b >= 85) colorIndex = 5;
        // Yellow (6)
        else if (r >= 85 && g >= 85 && b < 85) colorIndex = 6;
        // White (7)
        else if (r >= 85 && g >= 85 && b >= 85) colorIndex = 7;

        colors.push(Math.min(colorIndex, 7));
      }

      // Get bit values for the 4 pixels
      const val0 = bitList[colors[0]];
      const val1 = bitList[colors[1]];
      const val2 = bitList[colors[2]];
      const val3 = bitList[colors[3]];

      // Create the two bytes
      byte1 = "%" + val0[0] + val1[0] + val2[0] + val3[0];
      byte2 = "%" + val0[1] + val1[1] + val2[1] + val3[1];

      // Add to line based on twoPlan flag
      if (twoPlan) {
        line.push(byte1);
      }
      line.push(byte2);
    }

    res.push(line);
  }

  // Generate output
  for (let i = 0; i < res.length; i++) {
    output += "\tdc.b\t" + res[i].join(",") + "\n";
  }

  return output;
}
