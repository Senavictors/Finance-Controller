export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center">
      <main className="flex flex-col items-center gap-6 text-center">
        <h1 className="text-primary text-4xl font-bold">Finance Controller</h1>
        <p className="text-muted-foreground max-w-md text-lg">
          Personal finance management system. Track your income, expenses, and investments.
        </p>
      </main>
    </div>
  )
}
