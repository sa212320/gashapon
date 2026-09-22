// 小小的確認框。不用 window.confirm,因為那個在手機上長得很醜,
// 而且沒辦法配合我們的字體大小與配色。
export function createAsk({ dialog, text, yes, no }) {
  return message => new Promise(resolve => {
    text.textContent = message;
    const done = answer => {
      yes.removeEventListener('click', onYes);
      no.removeEventListener('click', onNo);
      dialog.removeEventListener('close', onClose);
      if (dialog.open) dialog.close();
      resolve(answer);
    };
    const onYes = () => done(true);
    const onNo = () => done(false);
    const onClose = () => done(false);
    yes.addEventListener('click', onYes);
    no.addEventListener('click', onNo);
    dialog.addEventListener('close', onClose);
    dialog.showModal();
  });
}
