import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dream Lux ERP",
    short_name: "DreamLux ERP",
    description: "Premium ERP for Dream Lux operations, payroll, inventory, and event delivery.",
    start_url: "/",
    display: "standalone",
    background_color: "#050506",
    theme_color: "#0c0c0e",
    orientation: "portrait",
    lang: "en",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icons/maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
