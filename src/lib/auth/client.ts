import { createAuthClient } from 'better-auth/client'

export const authClient = createAuthClient({
    baseURL:
        typeof globalThis !== 'undefined' && 'location' in globalThis
            ? (globalThis as any).location.origin
            : 'https://api.wanderer.moe',
})

export const auth = {
    signUp: async (email: string, password: string, name: string, username: string) => {
        const result = await authClient.signUp.email({
            email,
            password,
            name,
        })
        return result
    },

    signIn: async (email: string, password: string) => {
        const result = await authClient.signIn.email({
            email,
            password,
        })
        return result
    },

    signOut: async () => {
        const result = await authClient.signOut()
        return result
    },

    getSession: async () => {
        const result = await authClient.getSession()
        return result
    },

    forgetPassword: async (email: string) => {
        const result = await authClient.forgetPassword({
            email,
            redirectTo: '/reset-password',
        })
        return result
    },

    resetPassword: async (password: string, token: string) => {
        const result = await authClient.resetPassword({
            newPassword: password,
            token,
        })
        return result
    },
}

export type AuthClient = typeof authClient
