import React, { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, Trash2, Mail, User, AlertCircle, Check } from 'lucide-react'
import { Modal, Button, Input, Avatar } from '../../../ui'
import { useAuthStore } from '../stores/authStore'

export interface EditProfileModalProps {
  isOpen: boolean
  onClose: () => void
}

const MAX_AVATAR_SIZE_BYTES = 100 * 1024 // 100 KB

export function EditProfileModal({ isOpen, onClose }: EditProfileModalProps) {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.session?.user)
  const profile = useAuthStore((s) => s.profile)
  const updateUserProfile = useAuthStore((s) => s.updateUserProfile)

  const initialName =
    profile?.displayName ||
    (user?.user_metadata?.full_name as string | undefined) ||
    ''

  const initialAvatar =
    (user?.user_metadata?.avatar_url as string | undefined) ||
    (user?.id ? localStorage.getItem(`sanchay_user_avatar_${user.id}`) : null) ||
    null

  const [name, setName] = useState(initialName)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatar)
  const [fileError, setFileError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setName(initialName)
      setAvatarUrl(initialAvatar)
      setFileError(null)
      setIsSuccess(false)
    }
  }, [isOpen, initialName, initialAvatar])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileError(null)
    const file = e.target.files?.[0]
    if (!file) return

    // Strict 100 KB validation
    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      const sizeKb = (file.size / 1024).toFixed(1)
      setFileError(
        t(
          'profile.maxSizeExceeded',
          `Profile picture must be under 100 KB. Selected file is ${sizeKb} KB.`,
        ),
      )
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAvatarUrl(reader.result)
      }
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveAvatar = () => {
    setAvatarUrl(null)
    setFileError(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setIsSaving(true)
    setFileError(null)

    try {
      const res = await updateUserProfile(name.trim(), avatarUrl)
      if (res.error) {
        setFileError(res.error)
      } else {
        setIsSuccess(true)
        setTimeout(() => {
          onClose()
        }, 600)
      }
    } catch {
      setFileError(t('common.error', 'Failed to update profile. Please try again.'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('profile.editTitle', 'Edit Profile')}
      description={t('profile.editDesc', 'Update your personal details and profile picture.')}
      size="md"
    >
      <form onSubmit={handleSave} className="space-y-5">
        {fileError && (
          <div className="p-3 bg-danger/10 border border-danger/20 rounded-xl flex items-center gap-2.5 text-danger text-xs">
            <AlertCircle size={16} className="shrink-0" />
            <span>{fileError}</span>
          </div>
        )}

        {/* Profile Picture Upload Section */}
        <div className="flex flex-col items-center justify-center py-2 text-center">
          <div className="relative group">
            <Avatar
              src={avatarUrl}
              name={name || user?.email || 'User'}
              size={80}
              className="ring-4 ring-primary/20 shadow-md"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 p-2 rounded-full bg-primary text-primary-foreground shadow-lg hover:scale-105 transition-transform"
              title={t('profile.uploadPic', 'Upload Profile Picture (max 100 KB)')}
              aria-label="Upload photo"
            >
              <Camera size={14} />
            </button>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
          />

          <div className="mt-3 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              leftIcon={<Camera size={13} />}
              onClick={() => fileInputRef.current?.click()}
            >
              {avatarUrl ? t('profile.changePhoto', 'Change Photo') : t('profile.uploadPhoto', 'Upload Photo')}
            </Button>
            {avatarUrl && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-danger border-danger/30 hover:bg-danger/10"
                leftIcon={<Trash2 size={13} />}
                onClick={handleRemoveAvatar}
              >
                {t('common.remove', 'Remove')}
              </Button>
            )}
          </div>
          <span className="text-[11px] text-text-muted mt-1.5">
            {t('profile.sizeLimitNote', 'JPG, PNG, or WebP. Maximum file size: 100 KB.')}
          </span>
        </div>

        {/* Name input */}
        <Input
          label={t('profile.fullName', 'Full Name / Display Name')}
          placeholder="e.g. Mritunjay Pandey"
          value={name}
          onChange={(e) => setName(e.target.value)}
          leftIcon={<User size={16} />}
          required
        />

        {/* Email input (Display / Info) */}
        <div>
          <Input
            label={t('auth.email', 'Email Address')}
            value={user?.email || t('auth.offlineMode', 'Offline Account')}
            leftIcon={<Mail size={16} />}
            disabled
            className="opacity-75 cursor-not-allowed bg-surface/50"
          />
          <p className="text-[11px] text-text-muted mt-1">
            {t('profile.emailManaged', 'Email is associated with your authentication account.')}
          </p>
        </div>

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button
            type="submit"
            variant="primary"
            isLoading={isSaving}
            leftIcon={isSuccess ? <Check size={16} /> : undefined}
          >
            {isSuccess ? t('common.saved', 'Saved!') : t('common.saveChanges', 'Save Changes')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
