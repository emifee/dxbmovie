export default function ProfileLoading() {
  return (
    <div className="flex min-h-[calc(100vh-64px)] items-center justify-center p-4">
      <div className="relative mx-auto mt-4 flex w-full max-w-md flex-col items-center text-center">
        <div className="pointer-events-none absolute left-1/2 top-1/3 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-primary/20 blur-[80px] animate-pulse" />
        <div className="z-10 h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-primary" />
      </div>
    </div>
  );
}
