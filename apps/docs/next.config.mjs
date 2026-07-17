import nextra from "nextra"

const withNextra = nextra({})

export default withNextra({
	output: "export",
	// Served from the custom domain root (https://docs.hoardodile.com/)
	trailingSlash: true,
	images: { unoptimized: true },
})
