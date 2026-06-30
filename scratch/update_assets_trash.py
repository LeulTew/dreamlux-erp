import sys

filepath = 'frontend/src/app/assets/trash/page.tsx'

with open(filepath, 'r', encoding='utf-8') as file:
    content = file.read()

# Replace header block
old_header = """        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/assets")}
              className="p-2.5 rounded-2xl bg-card-alt border border-border hover:bg-border transition-all"
            >
              <HiArrowLeft className="w-5 h-5 text-foreground" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-foreground tracking-tight flex items-center gap-2">
                <HiTrash className="w-6 h-6 text-danger" />
                {t("Trash")}
              </h1>
              <p className="text-sm text-muted font-medium">
                {total} {t(total === 1 ? "deleted item" : "deleted items")}
              </p>
            </div>
          </div>
        </header>"""

new_header = """        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/assets")}
              className="flex h-12 w-12 items-center justify-center rounded-[6px] border border-border bg-card-alt text-muted [@media(hover:hover)]:hover:bg-neutral-900 [@media(hover:hover)]:hover:text-white transition-all duration-200"
              aria-label="Back to assets"
            >
              <HiArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-xl font-black tracking-tight text-foreground md:text-2xl">Deleted Assets</h1>
              <p className="text-xs font-medium text-muted">{total} records in trash</p>
            </div>
          </div>
        </header>"""

content = content.replace(old_header, new_header)

# Replace rounded corners in filters container
content = content.replace('rounded-3xl p-4 shadow-sm', 'rounded-md p-4 shadow-sm')

# Replace clear button classes
old_clear = 'className="w-full px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest bg-card-alt text-foreground border border-border hover:bg-border transition-all"'
new_clear = 'className="w-full px-4 py-2.5 rounded-md text-xs font-black uppercase tracking-widest bg-card-alt text-foreground border border-border hover:bg-border transition-all"'
content = content.replace(old_clear, new_clear)

# Replace search input rounded-2xl
old_input = 'className="w-full px-3 py-2.5 rounded-2xl border border-border bg-card-alt text-foreground text-sm font-semibold placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/30"'
new_input = 'className="w-full px-3 py-2.5 rounded-md border border-border bg-card-alt text-foreground text-sm font-semibold placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-primary/30"'
content = content.replace(old_input, new_input)

# Replace table outer container rounded corner
content = content.replace('rounded-4xl border border-border/30', 'rounded-md border border-border/30')

# Replace restore button
old_restore = """                        <button
                          onClick={() => setItemToRecover(item)}
                          className="px-3 py-2 rounded-xl bg-success text-white text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all inline-flex items-center gap-1"
                        >
                          <HiMiniArrowUturnLeft className="w-4 h-4" />
                          {t("Restore")}
                        </button>"""

new_restore = """                        <button
                          onClick={() => setItemToRecover(item)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600/10 text-emerald-600 border border-emerald-600/20 text-xs font-semibold hover:bg-emerald-600 hover:text-white transition-all active:scale-[0.98]"
                        >
                          <HiMiniArrowUturnLeft className="w-4 h-4" />
                          {t("Restore")}
                        </button>"""

content = content.replace(old_restore, new_restore)

# Replace permanent delete button
old_delete = """                        <button
                          onClick={() => setItemToPermanentlyDelete(item)}
                          className="px-3 py-2 rounded-xl bg-danger text-white text-xs font-black uppercase tracking-wider hover:opacity-90 transition-all"
                        >
                          {t("Permanent Delete")}
                        </button>"""

new_delete = """                        <button
                          onClick={() => setItemToPermanentlyDelete(item)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-rose-600/10 text-rose-600 border border-rose-600/20 text-xs font-semibold hover:bg-rose-600 hover:text-white transition-all active:scale-[0.98]"
                        >
                          {t("Permanent Delete")}
                        </button>"""

content = content.replace(old_delete, new_delete)

with open(filepath, 'w', encoding='utf-8') as file:
    file.write(content)

print("Update completed successfully!")
