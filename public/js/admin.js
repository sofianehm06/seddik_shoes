document.addEventListener('click', function (e) {
  var row = e.target.closest('tr[data-href]');
  if (row && !e.target.closest('a, button')) window.location.href = row.dataset.href;
});
document.addEventListener('submit', function (e) {
  var msg = (e.submitter && e.submitter.dataset.confirm) || e.target.dataset.confirm;
  if (msg && !window.confirm(msg)) e.preventDefault();
});
