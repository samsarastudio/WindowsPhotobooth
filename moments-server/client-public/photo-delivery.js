/* Prepare an actual image file before the guest taps the native share action. */
globalThis.PhotoDelivery = {
  async prepare(url, filename) {
    if (!navigator.share || !navigator.canShare) return null;
    const mime = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      heic: "image/heic",
      avif: "image/avif",
    }[filename?.split(".").pop().toLowerCase()];
    if (!mime) return null;
    try {
      const response = await fetch(url, { credentials: "same-origin" });
      if (!response.ok) return null;
      const blob = await response.blob();
      if (
        !blob.size ||
        blob.type.includes("json") ||
        blob.type.includes("text/")
      )
        return null;
      const file = new File([blob], filename, { type: mime });
      return navigator.canShare({ files: [file] }) ? file : null;
    } catch {
      return null;
    }
  },
};
