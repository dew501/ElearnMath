// Transisi halus setiap pindah halaman (dimatikan otomatis bila "reduce motion").
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-enter">{children}</div>;
}
