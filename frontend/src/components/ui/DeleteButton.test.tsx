/** @vitest-environment jsdom */
import React from "react"
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom"
import { DeleteButton } from "./DeleteButton"

describe("DeleteButton component", () => {
  it("renders correctly", () => {
    render(<DeleteButton />)
    expect(screen.getByRole("button")).toBeInTheDocument()
  })

  it("triggers onClick when clicked", () => {
    const handleClick = vi.fn()
    render(<DeleteButton onClick={handleClick} />)
    const button = screen.getByRole("button")
    fireEvent.click(button)
    expect(handleClick).toHaveBeenCalledOnce()
  })

  it("shows the default or custom tooltip text", () => {
    render(<DeleteButton tooltipText="custom remove" />)
    expect(screen.getByText("custom remove")).toBeInTheDocument()
  })
})
