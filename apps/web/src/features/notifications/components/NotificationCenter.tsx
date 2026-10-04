/**
 * features/notifications/components/NotificationCenter.tsx — In-app notification center.
 *
 * Displays a bell icon with unread count badge and a rich dropdown list of notifications.
 *
 * @see Sanchay_spec.md section 12.10, F-078
 */

import React, { useState, useRef, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { Bell, Check, CheckCheck, Clock, Calendar, AlertCircle, Trash2, X } from 'lucide-react'
import { notificationRepo } from '../../../db/repositories/notificationRepo'
import { Button, Badge } from '../../../ui'
import type { Notification } from '@sanchay/shared'

export function NotificationCenter() {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const notifications = useLiveQuery(
    () => notificationRepo.getAll(),
    [],
    [] as Notification[],
  )

  const unreadCount = notifications.filter((n) => !n.readAt).length

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isOpen])

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.readAt) {
      await notificationRepo.markAsRead(notification.id)
    }
    setIsOpen(false)

    // Navigate to target url if present in notification payload
    const data = notification.payload as { url?: string } | null
    if (data?.url) {
      navigate(data.url)
    }
  }

  const handleMarkAllRead = async () => {
    await notificationRepo.markAllAsRead()
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    await notificationRepo.delete(id)
  }

  const getIcon = (kind: string) => {
    switch (kind) {
      case 'bill_reminder':
        return <Calendar size={16} className="text-primary" />
      case 'budget_alert':
        return <AlertCircle size={16} className="text-warning" />
      default:
        return <Clock size={16} className="text-text-muted" />
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="In-app notifications"
        className="relative p-2 rounded-xl text-text-muted hover:text-text hover:bg-surface-overlay transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white shadow-sm animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Popover */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-surface-elevated border border-border shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
          {/* Header */}
          <div className="flex items-center justify-between p-3.5 border-b border-border bg-surface/50">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-text">Notifications</span>
              {unreadCount > 0 && (
                <Badge variant="primary" size="sm">
                  {unreadCount} new
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllRead}
                  className="text-xs text-primary hover:underline font-medium px-2 py-1 rounded"
                >
                  Mark all read
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-text-muted hover:text-text rounded-lg"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-border">
            {notifications.length === 0 ? (
              <div className="py-12 px-4 text-center">
                <div className="inline-flex p-3 rounded-full bg-surface-overlay text-text-muted mb-2">
                  <Bell size={24} />
                </div>
                <p className="text-sm font-medium text-text">No notifications</p>
                <p className="text-xs text-text-muted mt-1">
                  You're all caught up! Due bills and budget alerts will appear here.
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`group p-3.5 flex items-start gap-3 transition-colors hover:bg-surface-overlay/80 ${
                    !n.readAt ? 'bg-primary/5' : ''
                  }`}
                >
                  <div className="p-2 rounded-xl bg-surface shrink-0 mt-0.5 border border-border">
                    {getIcon(n.kind)}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleNotificationClick(n)}
                    className="flex-1 min-w-0 text-left focus:outline-none focus:ring-1 focus:ring-primary rounded"
                  >
                    <div className="flex items-center justify-between gap-1">
                      <p className={`text-xs font-semibold truncate ${!n.readAt ? 'text-text' : 'text-text-muted'}`}>
                        {n.title}
                      </p>
                      {!n.readAt && (
                        <span className="w-2 h-2 rounded-full bg-primary shrink-0" />
                      )}
                    </div>

                    <p className="text-xs text-text-muted mt-0.5 line-clamp-2 leading-relaxed">
                      {n.body}
                    </p>

                    <div className="flex items-center justify-between mt-2 pt-1 text-[11px] text-text-subtle">
                      <span>{new Date(n.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, n.id)}
                    className="opacity-0 group-hover:opacity-100 hover:text-danger p-1.5 rounded transition-opacity min-w-[32px] min-h-[32px] flex items-center justify-center text-text-muted shrink-0"
                    title="Delete notification"
                    aria-label="Delete notification"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
