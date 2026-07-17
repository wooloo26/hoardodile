import { loginRequest } from "@hoardodile/schemas"
import { Button } from "@hoardodile/ui/components/button"
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "@hoardodile/ui/components/form"
import { Input } from "@hoardodile/ui/components/input"
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
	authStatusQueryKey,
	authStatusQueryOptions,
	HttpError,
	login,
} from "@/features/auth"
import {
	hydrateSystemPrefs,
	invalidateSystemPrefsHydration,
} from "@/features/prefs/prefSyncHydrator"

export const Route = createFileRoute("/login")({
	beforeLoad: async ({ context }) => {
		try {
			const status = await context.queryClient.ensureQueryData(
				authStatusQueryOptions(),
			)
			if (status.authenticated) {
				throw redirect({ to: "/" })
			}
		} catch (err) {
			if (err instanceof HttpError) {
				return
			}
			throw err
		}
	},
	component: LoginRoute,
})

type LoginValues = { password: string }

function LoginRoute() {
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const { t } = useTranslation()
	const form = useForm<LoginValues>({
		resolver: standardSchemaResolver(loginRequest),
		defaultValues: { password: "" },
		mode: "onSubmit",
	})

	const mutation = useMutation({
		mutationFn: login,
		onSuccess: async (status) => {
			queryClient.setQueryData(authStatusQueryKey, status)
			await queryClient.invalidateQueries({ queryKey: authStatusQueryKey })
			invalidateSystemPrefsHydration()
			await hydrateSystemPrefs()
			await navigate({ to: "/" })
		},
		onError: (err) => {
			if (err instanceof HttpError && err.status === 401) {
				form.setError("password", {
					type: "server",
					message: t("login.errorIncorrect"),
				})
				return
			}
			toast.error(t("login.errorGeneric"))
		},
	})

	return (
		<div className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
			<div className="w-full max-w-sm rounded-lg border bg-background p-6 shadow-sm">
				<div className="mb-6 flex flex-col gap-1">
					<h1 className="text-xl font-semibold" data-testid="sign-in-heading">
						{t("login.title")}
					</h1>
					<p className="text-sm text-muted-foreground">
						{t("login.description")}
					</p>
				</div>
				<Form {...form}>
					<form
						noValidate
						aria-label={t("login.formAria")}
						onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
						className="flex flex-col gap-4"
					>
						<FormField
							control={form.control}
							name="password"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("login.password")}</FormLabel>
									<FormControl>
										<Input
											type="password"
											autoComplete="current-password"
											autoFocus
											{...field}
										/>
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<Button
							type="submit"
							disabled={mutation.isPending}
							data-testid="login-submit"
						>
							{mutation.isPending ? t("login.submitting") : t("login.submit")}
						</Button>
					</form>
				</Form>
			</div>
		</div>
	)
}
