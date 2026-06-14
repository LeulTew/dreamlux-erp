export type UserFormState = {
  username: string;
  rawPassword: string;
  fullName: string;
  email: string;
  phone: string;
  roleId: string;
  roleIds: string[];
  isActive: boolean;
  profileImageDataUrl: string;
  profileImagePreviewUrl: string;
};

export const initialFormState: UserFormState = {
  username: "",
  rawPassword: "",
  fullName: "",
  email: "",
  phone: "",
  roleId: "",
  roleIds: [],
  isActive: true,
  profileImageDataUrl: "",
  profileImagePreviewUrl: "",
};

export type ImageConversionProgress = {
  percent: number;
  message: string;
};

const ET_PHONE_REGEX = /^(?:\+2519\d{8}|09\d{8})$/;

export function normalizeEthiopianPhone(phoneRaw: string): { value: string | null; error?: string } {
  const compact = phoneRaw.replace(/[\s\-()]/g, "").trim();
  if (!compact) {
    return { value: null };
  }

  if (!ET_PHONE_REGEX.test(compact)) {
    return {
      value: null,
      error: "Phone must be +2519XXXXXXXX or 09XXXXXXXX",
    };
  }

  if (compact.startsWith("09")) {
    return { value: `+251${compact.slice(1)}` };
  }

  return { value: compact };
}

export async function convertImageFileToWebpDataUrl(
  file: File,
  onProgress?: (progress: ImageConversionProgress) => void,
): Promise<string> {
  onProgress?.({ percent: 5, message: "Starting conversion..." });

  const srcDataUrl = await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onprogress = (evt) => {
      if (evt.lengthComputable) {
        const readPercent = Math.min(50, Math.round((evt.loaded / evt.total) * 50));
        onProgress?.({ percent: readPercent, message: "Reading image..." });
      }
    };
    fr.onload = () => resolve(fr.result as string);
    fr.onerror = () => reject(new Error("Failed to read image"));
    fr.readAsDataURL(file);
  });

  onProgress?.({ percent: 60, message: "Decoding image..." });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const node = new Image();
    node.onload = () => resolve(node);
    node.onerror = () => reject(new Error("Invalid image"));
    node.src = srcDataUrl;
  });

  onProgress?.({ percent: 75, message: "Resizing for profile format..." });

  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable");

  const scale = Math.max(size / img.width, size / img.height);
  const targetW = img.width * scale;
  const targetH = img.height * scale;
  const offsetX = (size - targetW) / 2;
  const offsetY = (size - targetH) / 2;

  ctx.clearRect(0, 0, size, size);
  ctx.drawImage(img, offsetX, offsetY, targetW, targetH);

  onProgress?.({ percent: 92, message: "Encoding as WebP..." });

  const result = canvas.toDataURL("image/webp", 0.84);
  onProgress?.({ percent: 100, message: "WebP ready. Click Save User to persist." });

  return result;
}
