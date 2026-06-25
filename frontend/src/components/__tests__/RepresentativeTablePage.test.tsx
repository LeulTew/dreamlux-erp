/** @vitest-environment jsdom */
import React, { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { SortableHeader } from "../ui/SortableHeader";

// A representative table page mockup to test sorting/filtering integration in the frontend.
function RepresentativeTablePage({
  initialItems,
  onFetch,
}: {
  initialItems: Array<{ id: string; name: string; quantity: number; category: string }>;
  onFetch: (params: { search: string; category: string; sortBy: string; sortOrder: "asc" | "desc" }) => void;
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [sortBy, setSortBy] = useState("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const handleSort = (key: string, order: "asc" | "desc") => {
    setSortBy(key);
    setSortOrder(order);
    onFetch({ search, category, sortBy: key, sortOrder: order });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearch(val);
    onFetch({ search: val, category, sortBy, sortOrder });
  };

  const handleCategoryChange = (cat: string) => {
    setCategory(cat);
    onFetch({ search, category: cat, sortBy, sortOrder });
  };

  return (
    <div className="p-6 bg-background text-foreground">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between mb-6">
        <input
          type="text"
          placeholder="Search items..."
          value={search}
          onChange={handleSearchChange}
          className="px-3 py-2 border rounded-md"
        />
        <div className="flex gap-2">
          {["all", "Decor", "Furniture"].map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryChange(cat)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md border ${
                category === cat ? "bg-primary text-white border-primary" : "bg-card border-border"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      <table className="w-full text-left border-collapse border border-border">
        <thead>
          <tr className="bg-card-alt border-b border-border">
            <th className="p-4">
              <SortableHeader
                label="Item Name"
                sortKey="name"
                currentSortBy={sortBy}
                currentSortOrder={sortOrder}
                onSort={handleSort}
              />
            </th>
            <th className="p-4 text-right">
              <SortableHeader
                label="Quantity"
                sortKey="quantity"
                currentSortBy={sortBy}
                currentSortOrder={sortOrder}
                onSort={handleSort}
                align="right"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          {initialItems.map((item) => (
            <tr key={item.id} className="border-b border-border hover:bg-card-alt/50">
              <td className="p-4">{item.name}</td>
              <td className="p-4 text-right">{item.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

describe("RepresentativeTablePage sorting & filtering integration", () => {
  const mockItems = [
    { id: "1", name: "Gold Candelabra", quantity: 15, category: "Decor" },
    { id: "2", name: "Chandelier", quantity: 5, category: "Decor" },
    { id: "3", name: "Velvet Sofa", quantity: 8, category: "Furniture" },
  ];

  it("renders headers and initial items list correctly", () => {
    render(<RepresentativeTablePage initialItems={mockItems} onFetch={() => {}} />);

    expect(screen.getByText("Gold Candelabra")).toBeInTheDocument();
    expect(screen.getByText("Chandelier")).toBeInTheDocument();
    expect(screen.getByText("Velvet Sofa")).toBeInTheDocument();

    const nameBtn = screen.getByRole("button", { name: /Sorted by Item Name ascending/i });
    expect(nameBtn).toBeInTheDocument();
  });

  it("updates sort parameters and calls fetch handler with active search and filters", () => {
    const handleFetch = vi.fn();
    render(<RepresentativeTablePage initialItems={mockItems} onFetch={handleFetch} />);

    // 1. Change search term
    const searchInput = screen.getByPlaceholderText("Search items...");
    fireEvent.change(searchInput, { target: { value: "gold" } });
    expect(handleFetch).toHaveBeenLastCalledWith({
      search: "gold",
      category: "all",
      sortBy: "name",
      sortOrder: "asc",
    });

    // 2. Change category filter
    const decorBtn = screen.getByRole("button", { name: "Decor" });
    fireEvent.click(decorBtn);
    expect(handleFetch).toHaveBeenLastCalledWith({
      search: "gold",
      category: "Decor",
      sortBy: "name",
      sortOrder: "asc",
    });

    // 3. Click Name header to sort descending (since current is asc)
    const nameSortBtn = screen.getByRole("button", { name: /Sorted by Item Name ascending/i });
    fireEvent.click(nameSortBtn);
    expect(handleFetch).toHaveBeenLastCalledWith({
      search: "gold",
      category: "Decor",
      sortBy: "name",
      sortOrder: "desc",
    });

    // 4. Click Quantity header to sort ascending
    const qtySortBtn = screen.getByRole("button", { name: /Not sorted by Quantity/i });
    fireEvent.click(qtySortBtn);
    expect(handleFetch).toHaveBeenLastCalledWith({
      search: "gold",
      category: "Decor",
      sortBy: "quantity",
      sortOrder: "asc",
    });
  });
});
