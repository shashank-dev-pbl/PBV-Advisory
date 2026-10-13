// Admin pages print the real reason a load failed. A production build hides thrown errors behind a generic
// page, and these pages are for admins only, so the text is safe to show.
export default function AdminError({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto w-full max-w-[1000px] px-5 py-8 md:px-8">
      <div className="p-4 text-[13px]" style={{ background: "#fbe9e7", border: "1px solid #e3b8b2", color: "#8c1a1a" }}>
        <p className="font-semibold">{title}</p>
        <p className="mt-1 break-words">{message}</p>
      </div>
    </div>
  );
}
