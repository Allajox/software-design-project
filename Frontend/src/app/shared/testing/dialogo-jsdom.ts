/**
 * jsdom no implementa showModal()/close() de <dialog>, que usa ModalComponent. Solo para las pruebas: lo imita
 * con el atributo `open`, que es lo que lee el componente. En el navegador real esto no se usa.
 */
export function imitarDialogoNativo(): void {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void };
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    proto.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  }
}
