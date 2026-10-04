/**
 * features/notifications/services/pushService.ts — Web Push registration and management.
 *
 * Handles:
 * - Browser push permission requests
 * - VAPID key conversion and subscription via ServiceWorker PushManager
 * - Syncing subscription endpoints to Supabase `push_subscriptions`
 *
 * @see Sanchay_spec.md section 11.2, F-076, F-077
 */


function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export const pushService = {
  isSupported(): boolean {
    return (
      typeof window !== 'undefined' &&
      'Notification' in window &&
      'serviceWorker' in navigator &&
      'PushManager' in window
    )
  },

  getPermission(): NotificationPermission {
    if (!this.isSupported()) return 'denied'
    return Notification.permission
  },

  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) return 'denied'
    return await Notification.requestPermission()
  },

  async getSubscription(): Promise<PushSubscription | null> {
    if (!this.isSupported()) return null
    try {
      const registration = await navigator.serviceWorker.ready
      return await registration.pushManager.getSubscription()
    } catch {
      return null
    }
  },

  async subscribe(vapidPublicKey?: string): Promise<PushSubscription | null> {
    if (!this.isSupported()) return null

    const permission = await this.requestPermission()
    if (permission !== 'granted') {
      return null
    }

    try {
      const registration = await navigator.serviceWorker.ready
      const key =
        vapidPublicKey ||
        (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ||
        // Fallback test key if none configured
        'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'

      const applicationServerKey = urlBase64ToUint8Array(key)

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey as unknown as BufferSource,
      })

      // Store in Supabase if logged in
      const { supabase } = await import('../../../lib/supabase')
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        const subJson = subscription.toJSON()
        await supabase.from('push_subscriptions').upsert(
          {
            user_id: session.user.id,
            endpoint: subscription.endpoint,
            p256dh: subJson.keys?.p256dh ?? '',
            auth: subJson.keys?.auth ?? '',
            user_agent: navigator.userAgent,
          },
          { onConflict: 'endpoint' },
        )
      }

      return subscription
    } catch (err) {
      console.warn('Web push subscription failed:', err)
      return null
    }
  },

  async unsubscribe(): Promise<boolean> {
    try {
      const subscription = await this.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()

        // Remove from Supabase
        const { supabase } = await import('../../../lib/supabase')
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('endpoint', subscription.endpoint)

        return true
      }
      return false
    } catch (err) {
      console.warn('Failed to unsubscribe from push:', err)
      return false
    }
  },
}
