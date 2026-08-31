import { MemoryView } from "./_components/MemoryView";

/* Route: /memory — the RAG store's human view. Thin route entry; the view, its
   styles and its states are colocated. */
export default function MemoryPage() {
  return <MemoryView />;
}
