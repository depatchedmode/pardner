import { Dialog, DialogBackdrop, DialogContent } from '@ui-sdk/react/dialog'

export function BoardDialog({ children, className, ref, returnFocus, onClose, closeOnOutsidePress = false }) {
  return <Dialog defaultOpen closeOnOutsidePress={closeOnOutsidePress}
    onOpenChangeComplete={open => { if (!open) onClose() }}>
    <DialogBackdrop className="board-dialog-backdrop" />
    <DialogContent ref={ref} className={className} finalFocus={() => returnFocus}>
      {children}
    </DialogContent>
  </Dialog>
}
