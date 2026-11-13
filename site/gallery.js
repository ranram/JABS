const viewer = document.querySelector('.image-viewer');
const preview = viewer.querySelector('img');
for (const link of document.querySelectorAll('.screenshot-link')) {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    preview.src = link.href;
    preview.alt = link.querySelector('img').alt;
    viewer.showModal();
  });
}
viewer.querySelector('button').addEventListener('click', () => viewer.close());
viewer.addEventListener('click', (event) => {
  if (event.target === viewer) viewer.close();
});
