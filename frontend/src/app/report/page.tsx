"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getItems, getStores } from "@/lib/api";
import { Item, Store } from "@/lib/types";
import { HiArrowLeft } from "react-icons/hi2";
import { useLanguage } from "@/hooks/use-language";

const TRANSLATIONS: Record<string, Record<string, string>> = {
  en: {
    "No Image": "No Image",
    "Quantity": "Quantity",
    "Units": "Units",
    "Office": "Office",
    "Index Loading...": "Index Loading...",
    "Organization Record": "Organization Record",
    "Office Record": "Office Record",
    "Back": "Back",
    "Asset Assignment Report": "Asset Assignment Report",
    "Total Assets Indexed": "Total Assets Indexed",
    "Asset": "Asset",
    "Information": "Information"
  },
  am: {
    "No Image": "ምስል የለም",
    "Quantity": "ብዛት",
    "Units": "ዩኒቶች",
    "Office": "ቢሮ",
    "Index Loading...": "ሪፖርት በመጫን ላይ...",
    "Organization Record": "የድርጅት መዝገብ",
    "Office Record": "የቢሮ መዝገብ",
    "Back": "ተመለስ",
    "Asset Assignment Report": "የንብረት ምደባ ሪፖርት",
    "Total Assets Indexed": "አጠቃላይ የተመዘገቡ ንብረቶች",
    "Asset": "ንብረት",
    "Information": "መረጃ"
  }
};

// Sub-component for each row to handle aspect ratio detection
function ReportRow({ item, storeFilter, includeImages }: { item: Item; storeFilter: string; includeImages: boolean }) {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const [isLandscape, setIsLandscape] = useState(false);

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    if (img.naturalWidth > img.naturalHeight) {
      setIsLandscape(true);
    }
  };

  if (isLandscape && includeImages) {
    return (
      <tr className="border-b border-gray-100 break-inside-avoid">
        <td colSpan={2} className="py-6 px-1 align-top">
          <div className="flex flex-col gap-4">
            <div className="w-43.75 h-22.5 bg-white rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center shadow-sm">
              {item.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.image_url}
                  alt=""
                  className="w-full h-full object-contain"
                  crossOrigin="anonymous"
                  onLoad={handleImageLoad}
                />
              ) : (
                <span className="text-[8px] font-bold text-gray-300 uppercase">
                  {t("No Image")}
                </span>
              )}
            </div>
            <div>
              <h3 className="text-sm font-black text-black uppercase tracking-tight leading-tight mb-2">
                {item.name}
              </h3>
              <div className="flex items-center gap-6">
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none">
                    {t("Quantity")}
                  </span>
                  <span className="text-xs font-black text-black mt-1">
                    {item.quantity} {t("Units")}
                  </span>
                </div>
                {storeFilter === "all" && item.store?.name && (
                  <div className="flex flex-col border-l border-gray-100 pl-6">
                    <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none">
                      {t("Office")}
                    </span>
                    <span className="text-[10px] font-bold text-black mt-1 uppercase">
                      {item.store.name}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-gray-100 break-inside-avoid">
      <td className="py-4 px-1 align-top">
        {includeImages && (
          <div className="w-22.5 h-43.75 bg-white rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center shadow-sm">
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.image_url}
                alt=""
                className="w-full h-full object-contain"
                crossOrigin="anonymous"
                onLoad={handleImageLoad}
              />
            ) : (
              <span className="text-[8px] font-bold text-gray-300 uppercase p-2 text-center leading-tight">
                {t("No Image")}
              </span>
            )}
          </div>
        )}
      </td>
      <td className="py-4 px-3 align-top">
        <h3 className="text-sm font-black text-black uppercase tracking-tight leading-tight mb-3">
          {item.name}
        </h3>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col">
            <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none">
              {t("Quantity")}
            </span>
            <span className="text-xs font-black text-black mt-1 font-mono">
              {item.quantity} {t("Units")}
            </span>
          </div>
          {storeFilter === "all" && item.store?.name && (
            <div className="flex flex-col pt-1 border-t border-gray-50">
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest leading-none">
                {t("Office")}
              </span>
              <span className="text-[9px] font-bold text-black mt-1 uppercase tracking-tight">
                {item.store.name}
              </span>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function ReportContent() {
  const { lang } = useLanguage();
  const t = (key: string) => TRANSLATIONS[lang]?.[key] || key;
  const searchParams = useSearchParams();
  const storeFilter = searchParams.get("store") || "all";
  const includeImages = searchParams.get("images") !== "false";
  const [items, setItems] = useState<Item[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [itemsRes, storesRes] = await Promise.all([
          getItems(1, 5000, undefined, storeFilter === "all" ? undefined : storeFilter, false, "active"),
          getStores(),
        ]);
        setItems(itemsRes.items);
        setStores(storesRes);
        setLoading(false);
      } catch (error) {
        console.error("Failed to fetch report data:", error);
        setLoading(false);
      }
    }
    fetchData();
  }, [storeFilter]);

  // Once data is loaded and rendered, trigger print
  useEffect(() => {
    if (!loading && items.length > 0) {
      const timer = setTimeout(() => {
        window.print();
      }, 1500); // Wait for aspect ratios to be detected and re-rendered
      return () => clearTimeout(timer);
    }
  }, [loading, items.length]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white text-black font-mono uppercase tracking-widest text-[10px]">
        {t("Index Loading...")}
      </div>
    );
  }

  const selectedStoreName =
    storeFilter === "all"
      ? t("Organization Record")
      : stores.find((s) => s.id === storeFilter)?.name || t("Office Record");

  const splitItems = [
    items.slice(0, Math.ceil(items.length / 2)),
    items.slice(Math.ceil(items.length / 2)),
  ];

  return (
    <div className="bg-white text-black min-h-screen p-10 font-sans print:p-0">
      <div className="mb-6 md:hidden print:hidden">
        <Link
          href="/assets"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg border border-gray-300 text-sm font-semibold uppercase tracking-wider"
        >
          <HiArrowLeft className="w-4 h-4" />
          {t("Back")}
        </Link>
      </div>

      {/* Isolated Report Header */}
      <div className="flex justify-between items-start mb-10 border-b-4 border-black pb-8">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-black uppercase leading-none">
            {t("Asset Assignment Report")}
          </h1>
          <div className="mt-4 flex items-center gap-6">
            <div className="px-3 py-1 bg-black text-white text-[10px] font-bold uppercase tracking-[0.2em]">
              {new Date().toLocaleDateString(lang === "am" ? "am-ET" : "en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
            <div className="text-sm font-bold border-l-2 border-black pl-6 uppercase tracking-widest text-gray-800">
              {selectedStoreName}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-5xl font-black text-black leading-none">
            {items.length}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] mt-2 text-gray-500">
            {t("Total Assets Indexed")}
          </p>
        </div>
      </div>

      <div className="flex gap-10 items-start">
        {splitItems.map((columnItems, colIdx) => (
          <div key={colIdx} className="flex-1">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="text-left py-2 px-1 text-[9px] font-black uppercase tracking-widest w-22.5">
                    {t("Asset")}
                  </th>
                  <th className="text-left py-2 px-1 text-[9px] font-black uppercase tracking-widest">
                    {t("Information")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {columnItems.map((item) => (
                  <ReportRow
                    key={item.id}
                    item={item}
                    storeFilter={storeFilter}
                    includeImages={includeImages}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <style jsx global>{`
        @media print {
          @page {
            margin: 2cm 1.5cm;
            size: A4;
          }
          body {
            background: white !important;
            color: black !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense>
      <ReportContent />
    </Suspense>
  );
}
