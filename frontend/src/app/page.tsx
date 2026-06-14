"use client";
import { useState, useMemo, useCallback, useEffect, Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import {
  getEmployees,
  deleteEmployee,
  updateEmployee,
  recoverEmployee,
  getStores,
  getDepartments,
  exportEmployeeCSV,
  exportEmployeeExcel,
  deleteEmployeePermanent,
} from "@/lib/api";
import { Employee, EmployeesResponse } from "@/lib/types";
import AuthLayout from "@/components/AuthLayout";
import ImageCell from "@/components/ImageCell";
import MobileEmployeeCard from "@/components/MobileEmployeeCard";
import { HiMagnifyingGlass, HiTrash, HiPencilSquare, HiUsers, HiExclamationTriangle, HiPlus, HiArrowUturnLeft } from "react-icons/hi2";
import Select from "@/components/ui/Select";
import EditEmployeeSheet from "@/components/EditEmployeeSheet";
import PaginationControls from "@/components/PaginationControls";
import PrintOptionsModal from "@/components/PrintOptionsModal";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import DeleteConfirmModal from "@/components/DeleteConfirmModal";

const columnHelper = createColumnHelper<Employee>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function buildColumns(
  editMode: boolean,
  page: number,
  limit: number,
  debouncedUpdate: (id: string, field: string, value: string) => void,
  setEditingEmployee: (emp: Employee) => void,
  deleteMutation: { mutate: (id: string) => void },
  showTrash: boolean,
  recoverMutation: { mutate: (id: string) => void },
  setDeletingEmployee: (emp: Employee) => void,
  selectedIds: Set<string>,
  toggleSelection: (id: string) => void,
  isAllSelected: boolean,
  toggleAll: () => void,
  singleDelete: (id: string) => void,
  selectMode: boolean,
) {
  const cols = [];

  if (showTrash && selectMode) {
    cols.push(
      columnHelper.display({
        id: "select",
        header: () => (
          <button
            onClick={toggleAll}
            className={`w-5 h-5 rounded-md border flex justify-center items-center transition-all ${isAllSelected ? "bg-primary border-primary text-on-primary" : "border-border bg-card-alt"}`}
          >
            {isAllSelected && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
          </button>
        ),
        cell: ({ row }) => (
          <button
            onClick={() => toggleSelection(row.original.id)}
            className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all ${selectedIds.has(row.original.id) ? "bg-primary border-primary text-on-primary" : "border-border bg-card-alt"}`}
          >
            {selectedIds.has(row.original.id) && <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
          </button>
        ),
        size: 40,
      })
    );
  }

  cols.push(
    columnHelper.display({
      id: "index",
      header: "#",
      cell: (info) => (
        <span className="text-xs font-mono text-muted">{(page - 1) * limit + info.row.index + 1}</span>
      ),
      size: 40,
    }),
    columnHelper.display({
      id: "image",
      header: "Photo",
      cell: ({ row }) => (
        <ImageCell src={row.original.profile_photo_url} alt={row.original.full_name} />
      ),
      size: 80,
    })
  );

  cols.push(
    columnHelper.accessor("full_name", {
      header: "Employee Name",
      cell: ({ row, getValue }) =>
        editMode ? (
          <input
            type="text"
            defaultValue={getValue()}
            onChange={(e) => debouncedUpdate(row.original.id, "full_name", e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold"
          />
        ) : (
          <span className="font-bold text-foreground">{getValue()}</span>
        ),
      size: 200,
    }),
    columnHelper.accessor("employee_id", {
      header: "ID",
      cell: ({ row, getValue }) =>
        editMode ? (
          <input
            type="text"
            defaultValue={getValue()}
            onChange={(e) => debouncedUpdate(row.original.id, "employee_id", e.target.value)}
            className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono"
          />
        ) : (
          <span className="font-mono text-sm text-primary-dark font-bold">{getValue()}</span>
        ),
      size: 120,
    }),
    columnHelper.accessor("department", {
      header: "Department",
      cell: ({ row, getValue }) =>
        editMode ? (
          <input
            type="text"
            defaultValue={getValue() || ""}
            onChange={(e) => debouncedUpdate(row.original.id, "department", e.target.value)}
            placeholder="N/A"
            className="w-full px-2 py-1.5 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
        ) : (
          <span className="px-3 py-1 rounded-full bg-primary-light text-primary-dark text-xs font-medium whitespace-nowrap">
            {getValue() || "N/A"}
          </span>
        ),
    }),
    columnHelper.accessor("salary_level", {
      header: "Base Salary",
      cell: ({ row, getValue }) =>
        editMode ? (
          <Select
            options={[
              { id: "L1", label: "L1" },
              { id: "L2", label: "L2" },
              { id: "L3", label: "L3" },
              { id: "L4", label: "L4" },
            ]}
            value={getValue() || ""}
            onChange={(val) => debouncedUpdate(row.original.id, "salary_level", val)}
            placeholder="N/A"
          />
        ) : (
          <span className="text-sm font-bold text-foreground whitespace-nowrap">
            {getValue() || "N/A"}
            {row.original.base_salary != null && (
              <span className="ml-1.5 text-[10px] font-medium text-muted opacity-70">
                (ETB {Number(row.original.base_salary).toLocaleString()})
              </span>
            )}
          </span>
        ),
      size: 140,
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <div className="flex items-center justify-end gap-1.5">
          {showTrash ? (
            <>
              <button
                onClick={() => recoverMutation.mutate(row.original.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 transition-all"
                title="Restore Employee"
              >
                <HiArrowUturnLeft className="w-3.5 h-3.5" />
                Restore
              </button>
              {!selectMode && (
                <button
                  onClick={() => singleDelete(row.original.id)}
                  className="p-2 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-all"
                  title="Delete permanently"
                >
                  <HiTrash className="w-3.5 h-3.5" />
                </button>
              )}
            </>
          ) : (
            <>
              <button
                onClick={() => setEditingEmployee(row.original)}
                className="p-2 rounded-lg hover:bg-primary-light text-muted hover:text-primary transition-all"
                title="Edit Details"
              >
                <HiPencilSquare className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDeletingEmployee(row.original)}
                className="p-2 rounded-lg hover:bg-red-50 text-muted hover:text-danger transition-all"
                title="Move to Trash"
              >
                <HiTrash className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ),
      size: 150,
    })
  );

  return cols;
}


function EmployeesPageContent() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const [officeId, setOfficeId] = useState("all");
  const [departmentId, setDepartmentId] = useState("all");
  const [sortBy, setSortBy] = useState("salary");
  const [sortOrder, setSortOrder] = useState("desc");
  const [exportingCSV, setExportingCSV] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);         // toggle checkbox mode
  const [showDeleteModal, setShowDeleteModal] = useState(false); // bulk delete modal
  const [isPermanentDeleting, setIsPermanentDeleting] = useState(false); // loading spinner
  const [singleDeleteId, setSingleDeleteId] = useState<string | null>(null); // single-item delete modal

  const handleExportCSV = async () => {
    setExportingCSV(true);
    try { await exportEmployeeCSV(officeId); } 
    catch (e) { console.error("Export Failed", e); }
    finally { setExportingCSV(false); }
  };
  
  const handleExportExcel = async () => {
    setExportingExcel(true);
    try { await exportEmployeeExcel(officeId); } 
    catch (e) { console.error("Export Failed", e); }
    finally { setExportingExcel(false); }
  };
  const limit = 10;

  const { data, isLoading } = useQuery<EmployeesResponse>({
    queryKey: ["employees", page, search, showTrash, officeId, departmentId, sortBy, sortOrder],
    queryFn: () => getEmployees(page, limit, search, showTrash ? "trash" : "active", officeId, departmentId, sortBy, sortOrder),
  });

  const { data: stores } = useQuery({
    queryKey: ["stores"],
    queryFn: () => getStores(),
  });

  const { data: departments } = useQuery({
    queryKey: ["departments"],
    queryFn: () => getDepartments(),
  });

  const employees = useMemo(() => data?.employees || [], [data?.employees]);
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / limit);

  useEffect(() => {
    const editId = searchParams.get("edit");
    let active = true;

    if (editId && !editingEmployee) {
      const empToEdit = employees.find((emp) => emp.id === editId);
      if (empToEdit) {
        setEditingEmployee(empToEdit);
      } else {
        // Fetch from api if not in current page
        import("@/lib/api").then(({ api }) => {
          api.get(`/employees/${editId}`).then((res) => {
            if (active && res.data) {
              setEditingEmployee(res.data);
            }
          }).catch(console.error);
        });
      }
    }
    return () => { active = false; };
  }, [searchParams, employees, editingEmployee]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteEmployee(id),
    onSuccess: () => {
      toast.success("Employee deleted");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setEmployeeToDelete(null);
    },
    onError: () => {
      toast.error("Failed to delete");
    },
  });

  const recoverMutation = useMutation({
    mutationFn: (id: string) => recoverEmployee(id),
    onSuccess: () => {
      toast.success("Employee restored");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: () => {
      toast.error("Recovery failed");
    },
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: ({ id, field, value }: { id: string; field: string; value: string }) =>
      updateEmployee(id, { [field]: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      toast.success("Saved");
    },
    onError: (error: Error) => {
      toast.error(`Update failed: ${error.message}`);
    },
  });

  const debouncedUpdate = useCallback(
    (id: string, field: string, value: string) => {
      const key = `${id}-${field}`;
      if (debounceTimers.has(key)) {
        clearTimeout(debounceTimers.get(key));
      }
      const timer = setTimeout(() => {
        updateEmployeeMutation.mutate({ id, field, value });
        debounceTimers.delete(key);
      }, 800);
      debounceTimers.set(key, timer);
    },
    [updateEmployeeMutation],
  );

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (employees && selectedIds.size === employees.length && employees.length > 0) {
      setSelectedIds(new Set());
    } else if (employees) {
      setSelectedIds(new Set(employees.map(e => e.id)));
    }
  }, [employees, selectedIds.size]);

  const handlePermanentDelete = async () => {
    if (selectedIds.size === 0) return;
    setIsPermanentDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id => deleteEmployeePermanent(id)));
      toast.success(`${selectedIds.size} record${selectedIds.size > 1 ? "s" : ""} permanently deleted`);
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setSelectedIds(new Set());
      setSelectMode(false);
      setShowDeleteModal(false);
    } catch (e: unknown) {
      toast.error((e as {response?: {data?: {error?: string}}}).response?.data?.error || "Deletion failed");
    } finally {
      setIsPermanentDeleting(false);
    }
  };

  const handleSinglePermanentDelete = (id: string) => {
    setSingleDeleteId(id);
  };

  const confirmSingleDelete = async () => {
    if (!singleDeleteId) return;
    setIsPermanentDeleting(true);
    try {
      await deleteEmployeePermanent(singleDeleteId);
      toast.success("Record permanently deleted");
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      setSingleDeleteId(null);
    } catch (e: unknown) {
      toast.error((e as {response?: {data?: {error?: string}}}).response?.data?.error || "Deletion failed");
    } finally {
      setIsPermanentDeleting(false);
    }
  };

  const columns = useMemo(
    () => buildColumns(editMode, page, limit, debouncedUpdate, setEditingEmployee, deleteMutation, showTrash, recoverMutation, setEmployeeToDelete, selectedIds, toggleSelection, employees.length > 0 && selectedIds.size === employees.length, toggleAll, handleSinglePermanentDelete, selectMode),
    [editMode, page, limit, debouncedUpdate, setEditingEmployee, deleteMutation, showTrash, recoverMutation, setEmployeeToDelete, selectedIds, toggleSelection, employees.length, toggleAll, selectMode],
  );

  const table = useReactTable({
    data: employees,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <AuthLayout>
      <div className="max-w-6xl mx-auto pt-4 md:py-8 px-4 sm:px-6 md:px-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-primary/10 dark:bg-primary/20 rounded-2xl text-primary shadow-sm md:shadow-premium">
            <HiUsers className="w-6 h-6 md:w-7 md:h-7" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black text-foreground tracking-tight">
              Employees
            </h1>
            <p className="text-xs md:text-sm text-muted font-medium">
              {total} {showTrash ? "Deleted Records" : "Total Records"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-37.5 md:max-w-sm">
             <HiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
             <input
               type="text"
               placeholder="Search..."
               value={search}
               onChange={(e) => { setSearch(e.target.value); setPage(1); }}
               className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-card-alt border-none focus:ring-1 focus:ring-muted/30 transition-all text-sm outline-none shadow-sm"
             />
          </div>

          <Select
            options={[
              { id: "all", label: "All Offices" },
              ...(stores?.map((s: { id: string; name: string }) => ({ id: s.id, label: s.name })) || []),
            ]}
            value={officeId}
            onChange={(val) => { setOfficeId(val); setPage(1); }}
            className="min-w-35"
          />

          <Select
            options={[
              { id: "all", label: "All Depts" },
              ...(departments?.map((d: { id: string; name: string }) => ({ id: d.id, label: d.name })) || []),
            ]}
            value={departmentId}
            onChange={(val) => { setDepartmentId(val); setPage(1); }}
            className="min-w-35"
          />

          <Select
            options={[
              { id: "salary", label: "Sort: Salary" },
              { id: "name", label: "Sort: Name" },
              { id: "date", label: "Sort: Recent" },
            ]}
            value={sortBy}
            onChange={(val) => { setSortBy(val); setPage(1); }}
            className="min-w-35"
          />

          <button
            onClick={() => { setSortOrder(sortOrder === "asc" ? "desc" : "asc"); setPage(1); }}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-card-alt border border-border text-muted hover:text-foreground transition-all"
            title={sortOrder === "asc" ? "Sort Ascending" : "Sort Descending"}
          >
            {sortOrder === "asc" ? "↑" : "↓"}
          </button>
          
          <button
            onClick={() => { setShowTrash(!showTrash); setPage(1); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              showTrash ? "bg-red-500 text-white" : "bg-card-alt text-foreground border border-border"
            }`}
          >
            <HiTrash className="w-4 h-4" />
            {showTrash ? "Exit Trash" : "Trash"}
          </button>

          {!showTrash && (
            <button
              onClick={() => router.push("/insert")}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-black bg-primary text-background shadow-premium hover:opacity-90 active:scale-[0.98] transition-all"
            >
              <HiPlus className="w-4 h-4" />
              Add Employee
            </button>
          )}

          {!showTrash && (
            <button
              onClick={() => setEditMode(!editMode)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                editMode ? "bg-primary text-on-primary" : "bg-card-alt text-foreground border border-border"
              }`}
            >
              <HiPencilSquare className="w-4 h-4" />
              {editMode ? "Done" : "Quick Edit"}
            </button>
          )}

          {showTrash && (
            <>
              <button
                onClick={() => {
                  setSelectMode(!selectMode);
                  if (selectMode) setSelectedIds(new Set());
                }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${
                  selectMode ? "bg-primary/10 text-primary border-primary/30" : "bg-card-alt text-foreground border-border"
                }`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                {selectMode ? `${selectedIds.size} Selected` : "Select"}
              </button>
              {selectMode && selectedIds.size > 0 && (
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-red-600 text-white text-sm font-black rounded-xl shadow-premium hover:bg-red-700 active:scale-95 transition-all"
                >
                  <HiTrash className="w-4 h-4" />
                  Delete {selectedIds.size}
                </button>
              )}
            </>
          )}

          {!showTrash && (
            <div className="relative">
              <button
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border ${exportMenuOpen ? "bg-primary text-on-primary border-primary" : "bg-card-alt text-foreground border-border"}`}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
                Export
                <svg className={`w-3.5 h-3.5 transition-transform ${exportMenuOpen ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
              </button>
              <AnimatePresence>
                {exportMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setExportMenuOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: 6, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 4, scale: 0.96 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 mt-2 w-40 bg-card border border-border rounded-2xl shadow-premium overflow-hidden z-50 flex flex-col text-foreground"
                    >
                      <div className="px-3 pt-2.5 pb-1 text-[9px] font-black uppercase tracking-[0.2em] text-muted">Choose Format</div>
                      <button
                        onClick={() => { handleExportCSV(); setExportMenuOpen(false); }}
                        disabled={exportingCSV}
                        className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-left hover:bg-card-alt transition-colors w-full disabled:opacity-50 font-semibold text-foreground"
                      >
                        <svg className="w-4 h-4 text-emerald-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0 1 18 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0 1 18 7.875v1.5m1.125-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 0 1 6 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c0 .621.504 1.125 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-9.75 0h9.75" /></svg>
                        {exportingCSV ? "Exporting…" : "CSV Spreadsheet"}
                      </button>
                      <button
                        onClick={() => { handleExportExcel(); setExportMenuOpen(false); }}
                        disabled={exportingExcel}
                        className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-left hover:bg-card-alt transition-colors w-full border-t border-border disabled:opacity-50 font-semibold text-foreground"
                      >
                        <svg className="w-4 h-4 text-blue-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                        {exportingExcel ? "Exporting…" : "Excel Workbook"}
                      </button>
                      <button
                        onClick={() => { setIsPrintModalOpen(true); setExportMenuOpen(false); }}
                        className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-left hover:bg-card-alt transition-colors w-full border-t border-border font-semibold text-foreground"
                      >
                        <svg className="w-4 h-4 text-rose-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" /></svg>
                        PDF Report
                      </button>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>
          )}

        </div>
      </header>

      <DeleteConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handlePermanentDelete}
        title={`Permanently delete ${selectedIds.size} record${selectedIds.size > 1 ? "s" : ""}?`}
        message="This cannot be undone. Selected employees will be wiped from the database forever."
        itemName={`${selectedIds.size} employee${selectedIds.size > 1 ? "s" : ""} selected`}
        isDeleting={isPermanentDeleting}
        confirmLabel="Delete Forever"
      />

      <DeleteConfirmModal
        isOpen={!!singleDeleteId}
        onClose={() => setSingleDeleteId(null)}
        onConfirm={confirmSingleDelete}
        title="Permanently delete this employee?"
        message="This cannot be undone. This employee will be wiped from the database forever."
        itemName="1 employee"
        isDeleting={isPermanentDeleting}
        confirmLabel="Delete Forever"
      />

      <PrintOptionsModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        onPrint={(options) => {
          const imgQuery = options.includeImages ? "&images=true" : "&images=false";
          const eventsQuery = options.includeEvents ? "&events=true" : "&events=false";
          window.open(`/report/employees?search=${search}&office_id=${officeId}&sortBy=${sortBy}&sortOrder=${sortOrder}${imgQuery}${eventsQuery}`, "_blank");
        }}
        title="Print Employee Directory"
        description="Choose whether to include profile pictures in the personnel directory document."
        showIncludeEvents
      />

      {isLoading ? (
        <div className="space-y-4 animate-pulse">
           {[...Array(5)].map((_, i) => (
             <div key={i} className="h-16 bg-card-alt rounded-2xl border border-border/50" />
           ))}
        </div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-card rounded-3xl border border-dashed border-border text-center px-4">
          <HiExclamationTriangle className="w-16 h-16 text-muted mb-4 opacity-10" />
          <h3 className="text-lg font-bold text-foreground opacity-50">
            {showTrash ? "Trash is empty" : "No employees found"}
          </h3>
        </div>
      ) : (
        <>
          <div className="hidden md:block overflow-hidden glass-card rounded-4xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-card-alt/30 border-b border-border/50 text-[10px] uppercase tracking-[0.2em] text-muted font-black">
                  {table.getHeaderGroups()[0].headers.map((header) => (
                    <th key={header.id} className="px-6 py-5" style={{ width: header.getSize() }}>
                      {flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.getRowModel().rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/30 hover:bg-primary-light/5 transition-all">
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-6 py-4">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {employees.map((emp) => (
              <MobileEmployeeCard 
                key={emp.id} 
                employee={emp} 
                onTap={setEditingEmployee} 
                editMode={editMode}
                onUpdate={debouncedUpdate}
                onDelete={showTrash ? (employee) => handleSinglePermanentDelete(employee.id) : setEmployeeToDelete}
                showTrash={showTrash}
                onRestore={(employee) => recoverMutation.mutate(employee.id)}
                selected={selectedIds.has(emp.id)}
                onSelect={toggleSelection}
                selectMode={selectMode}
              />
            ))}
          </div>


          <PaginationControls
            page={page}
            totalPages={Math.max(1, totalPages)}
            onPageChange={setPage}
          />
        </>
      )}

      {editingEmployee && (
          <EditEmployeeSheet 
            employee={editingEmployee} 
            onClose={() => {
              setEditingEmployee(null);
              if (searchParams.get("edit")) {
                router.replace(pathname, { scroll: false });
              }
            }} 
          />
        )}

      <DeleteConfirmModal 
        isOpen={!!employeeToDelete}
        onClose={() => setEmployeeToDelete(null)}
        onConfirm={() => employeeToDelete && deleteMutation.mutate(employeeToDelete.id)}
        isDeleting={deleteMutation.isPending}
        title="Delete Employee"
        message="Are you sure you want to move this employee to trash?"
        itemName={employeeToDelete?.full_name || ""}
      />
      </div>
    </AuthLayout>
  );
}

export default function EmployeesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-muted-foreground animate-pulse text-[10px] font-black uppercase tracking-widest">Loading Dashboard...</div>}>
      <EmployeesPageContent />
    </Suspense>
  );
}
