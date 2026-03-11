import Projects from "./_components/Projects"
export default function EditorLayout({
    children
}: {
    children: React.ReactNode
}) {
    return (
        <section className=" h-screen flex">
            <Projects />
            {children}
        </section>
    )
}