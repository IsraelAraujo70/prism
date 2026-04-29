import { useCallback, useEffect, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { api, type NotificationRow } from './api'

export function useNotifications() {
  const [items, setItems] = useState<NotificationRow[]>([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [list, count] = await Promise.all([
      api.listNotifications(),
      api.unreadNotificationCount(),
    ])
    setItems(list)
    setUnread(count)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
    const unsubPromise = listen('notifications:changed', () => {
      refresh()
    })
    return () => {
      unsubPromise.then((unsub) => unsub())
    }
  }, [refresh])

  const markRead = useCallback(
    async (threadId: string) => {
      await api.markNotificationRead(threadId)
      await refresh()
    },
    [refresh],
  )

  const markAllRead = useCallback(async () => {
    await api.markAllNotificationsRead()
    await refresh()
  }, [refresh])

  const syncNow = useCallback(async () => {
    await api.syncNotificationsNow()
  }, [])

  return { items, unread, loading, markRead, markAllRead, syncNow, refresh }
}
