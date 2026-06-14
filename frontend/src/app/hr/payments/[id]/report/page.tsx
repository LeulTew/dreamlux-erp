"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import UserAvatar from "@/components/UserAvatar";
import { HiArrowLeft } from "react-icons/hi2";
import { useSearchParams } from "next/navigation";
import { getPayrollRun } from "@/lib/api";
import { PayrollRun, PayrollEmployeeLine, PayrollRunLineEvent } from "@/lib/types";

export default function PayrollReportPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();
  const includeImages = searchParams.get("includeImages") === "true";
  const id = resolvedParams.id;
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const data = await getPayrollRun(id);
        setRun(data);
        setLoading(false);
      } catch (error) {
        console.error("Failed to fetch payroll report data:", error);
        setLoading(false);
      }
    }
    fetchData();
  }, [id]);

  useEffect(() => {
    if (!loading && run) {
      const timer = setTimeout(() => {
        window.print();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [loading, run]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white text-black font-mono uppercase tracking-widest text-[10px]">
        Generating Report...
      </div>
    );
  }

  if (!run) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-white text-black p-8">
        <p className="text-xl font-bold mb-4">Error generating report</p>
        <Link href={`/hr/payments/${id}`} className="text-blue-600 underline">
          Return to Run
        </Link>
      </div>
    );
  }

  const dateStr = new Date().toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  const periodTag = run.created_at
    ? new Date(run.created_at).toISOString().slice(0, 7)
    : `${run.year}-${String(run.month).padStart(2, "0")}`;

  return (
    <div className="bg-white text-black min-h-screen p-10 font-sans print:p-0">
      <div className="mb-6 md:hidden print:hidden">
        <Link
          href={`/hr/payments/${id}`}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-gray-300 text-sm font-bold uppercase tracking-wider hover:bg-gray-50"
        >
          <HiArrowLeft className="w-4 h-4" />
          Back
        </Link>
      </div>

      <div className="flex justify-between items-start mb-10 border-b-4 border-black pb-8">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-black uppercase leading-none">
            Payroll Settlement
          </h1>
          <div className="mt-4 flex items-center gap-6">
            <div className="px-3 py-1 bg-black text-white text-[10px] font-bold uppercase tracking-[0.2em]">
              {dateStr}
            </div>
            <div className="text-sm font-bold border-l-2 border-black pl-6 uppercase tracking-widest text-gray-800">
              Period {periodTag}
            </div>
            <div className="text-sm font-bold border-l-2 border-primary pl-6 uppercase tracking-widest text-primary">
              Status: {run.status}
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-5xl font-black text-black leading-none">
            ETB {Number(run.total_payroll_value ?? 0).toLocaleString()}
          </p>
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] mt-2 text-gray-500">
            Total Payout Amount
          </p>
        </div>
      </div>

      <div className="mb-8">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-black">
              {includeImages && (
                <th className="text-left py-2 px-1 text-[10px] font-black uppercase tracking-widest w-12">
                  Photo
                </th>
              )}
              <th className="text-left py-2 px-1 text-[10px] font-black uppercase tracking-widest">
                Employee
              </th>
              <th className="text-right py-2 px-2 text-[10px] font-black uppercase tracking-widest w-32">
                Base
              </th>
              <th className="text-right py-2 px-2 text-[10px] font-black uppercase tracking-widest w-32">
                Events Total
              </th>
              <th className="text-right py-2 px-1 text-[10px] font-black uppercase tracking-widest w-32">
                Payout
              </th>
            </tr>
          </thead>
          <tbody>
            {(run.employee_lines || []).map((line: PayrollEmployeeLine) => (
              <tr key={line.id} className="border-b border-gray-200 break-inside-avoid">
                {includeImages && (
                  <td className="py-4 px-1 align-top">
                    <UserAvatar 
                      fullName={line.employee_name_snapshot}
                      imageUrl={line.profile_photo_url}
                      sizeClassName="w-10 h-10"
                    />
                  </td>
                )}
                <td className="py-4 px-1 align-top">
                  <h3 className="text-sm font-black text-black uppercase tracking-tight leading-tight mb-2">
                    {line.employee_name_snapshot}
                  </h3>
                  {line.events && line.events.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                      {line.events.map((ev: PayrollRunLineEvent) => (
                        <div key={ev.id} className="text-[8px] font-bold text-gray-500 uppercase tracking-widest">
                          {ev.quantity}x {ev.event_name} <span className="text-gray-400">({Number(ev.total_price_for_type).toLocaleString()})</span>
                        </div>
                      ))}
                    </div>
                  )}
                </td>
                <td className="py-4 px-2 align-top text-right font-mono text-sm">
                  {Number(line.snapshot_base_salary).toLocaleString()}
                </td>
                <td className="py-4 px-2 align-top text-right font-mono text-sm text-green-700">
                  +{Number(line.total_events_value).toLocaleString()}
                </td>
                <td className="py-4 px-1 align-top text-right font-mono font-black text-sm">
                  {Number(line.total_line_pay).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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
