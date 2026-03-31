'use client';

import { useState } from 'react';
import { Modal } from './Modal';
import { QuickInput, type AdaptPreviewItem } from './QuickInput';
import { SmartAdaptConfirmModal } from './SmartAdaptConfirmModal';
import type { TagNode } from './TagTree';

/**
 * 快速录入弹窗：将 QuickInput 的全部内容以 Modal 形式展示
 * 点击「智能适配」后弹出确认弹窗，展示每项内容的适配标签供用户确认
 */
export function QuickInputModal({
  open,
  onClose,
  token,
  selectedTagId,
  tags,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  selectedTagId: string | null;
  tags: TagNode[];
  /** 保存/适配成功后回调 */
  onSuccess: (result?: { selectTagId?: string }) => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [previewItems, setPreviewItems] = useState<AdaptPreviewItem[]>([]);
  const [previewRecordedAt, setPreviewRecordedAt] = useState('');

  const handleAdaptPreview = (items: AdaptPreviewItem[], recordedAt: string) => {
    setPreviewItems(items);
    setPreviewRecordedAt(recordedAt);
    setConfirmOpen(true);
  };

  const handleConfirmSuccess = (result?: { selectTagId?: string }) => {
    setConfirmOpen(false);
    setPreviewItems([]);
    onSuccess(result);
  };

  if (!open) return null;

  return (
    <>
      <Modal title="快速录入" open={open} onClose={onClose} contentWidth={640} square>
        <QuickInput
          token={token}
          selectedTagId={selectedTagId}
          tags={tags}
          onCreated={(result) => onSuccess(result)}
          inModal
          onAdaptPreview={handleAdaptPreview}
        />
      </Modal>
      <SmartAdaptConfirmModal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        token={token}
        tags={tags}
        items={previewItems}
        recordedAt={previewRecordedAt}
        onSuccess={handleConfirmSuccess}
      />
    </>
  );
}
