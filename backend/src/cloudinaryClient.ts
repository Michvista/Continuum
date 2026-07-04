import { v2 as cloudinary } from "cloudinary";

let configured = false;
 
function ensureConfigured() {
  if (configured) return;
  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    throw new Error(
      "Cloudinary isn't configured — set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, " +
        "CLOUDINARY_API_SECRET in backend/.env"
    );
  }
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  configured = true;
}

// Uploads a raw buffer (from multer's in-memory storage) straight to
// Cloudinary without writing anything to disk first.
export function uploadBuffer(
  buffer: Buffer,
  options: { resourceType: "image" | "video"; folder: string }
): Promise<string> {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: options.resourceType, folder: options.folder },
      (error, result) => {
        if (error || !result) return reject(error || new Error("Cloudinary upload returned no result"));
        resolve(result.secure_url);
      }
    );
    stream.end(buffer);
  });
}
