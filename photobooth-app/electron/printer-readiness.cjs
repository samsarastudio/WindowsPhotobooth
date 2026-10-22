function printerConnectionError(printer) {
  if (!printer) return 'The selected printer is no longer installed. Select a printer in Admin.';
  if (printer.workOffline === true || printer.workOffline === 'true' || Number(printer.printerStatus) === 7) {
    return `${printer.name || 'The printer'} is offline. Turn it on and check its connection, then try printing again.`;
  }
  return null;
}
module.exports = { printerConnectionError };
