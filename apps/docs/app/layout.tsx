import { Head } from "nextra/components"
import { getPageMap } from "nextra/page-map"
import { Footer, Layout, Navbar } from "nextra-theme-docs"
import type { ReactNode } from "react"
import "nextra-theme-docs/style.css"

export const metadata = {
	title: {
		default: "hoardodile docs",
		template: "%s – hoardodile docs",
	},
	description:
		"Documentation for hoardodile — a privacy-first, self-hosted archiving app for personal media and documents.",
}

const navbar = (
	<Navbar
		logo={<b>hoardodile</b>}
		projectLink="https://github.com/wooloo26/hoardodile"
	/>
)
const footer = <Footer>GPL-3.0 {new Date().getFullYear()} © wooloo26.</Footer>

export default async function RootLayout({
	children,
}: {
	children: ReactNode
}) {
	return (
		<html lang="en" dir="ltr" suppressHydrationWarning>
			<Head />
			<body>
				<Layout
					navbar={navbar}
					pageMap={await getPageMap()}
					docsRepositoryBase="https://github.com/wooloo26/hoardodile/tree/main/apps/docs"
					footer={footer}
				>
					{children}
				</Layout>
			</body>
		</html>
	)
}
