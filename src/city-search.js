// SPDX-License-Identifier: GPL-3.0-only
import { t } from './i18n.js';
import { searchCities } from './weather.js';
import { escapeText } from './html.js';

export function bindCitySearch(form) {
  if (!form?.querySelector('#city-query')) return () => {};
  const events = new AbortController();
  let search = null, results = [];
  const options = {signal:events.signal};
  form.querySelector('#city-query').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      form.querySelector('[data-city-search]').click();
    }
  }, options);
  form.addEventListener('click', async event => {
    const button = event.target.closest('[data-city-search],[data-city-result]');
    if (!button) return;
    event.preventDefault();
    const output = form.querySelector('#city-results');
    if (button.hasAttribute('data-city-result')) {
      const city = results[Number(button.dataset.cityResult)];
      if (city) {
        form.elements.cityName.value = city.name;
        form.elements.latitude.value = city.latitude;
        form.elements.longitude.value = city.longitude;
        form.dataset.weatherCountryCode=city.countryCode||'';
        form.dataset.weatherCoordinates=`${city.latitude},${city.longitude}`;
        output.replaceChildren();
      }
      return;
    }
    search?.abort();
    search = new AbortController();
    const request = search, timer = setTimeout(() => request.abort(), 8000);
    output.textContent = t('正在搜索…');
    try {
      const found = await searchCities(form.querySelector('#city-query').value, request.signal);
      if (request !== search || !form.isConnected) return;
      results = found;
      output.innerHTML = results.map((city,index) => `<button type="button" data-city-result="${index}"><strong>${escapeText(city.name)}</strong><span>${escapeText(city.region)}</span></button>`).join('') || t('没有找到城市，请使用英文名称或填写坐标。');
    } catch {
      if (request === search && form.isConnected) output.textContent = t('城市搜索失败，请重试或填写坐标。');
    } finally { clearTimeout(timer); }
  }, options);
  return () => { events.abort(); search?.abort(); };
}
