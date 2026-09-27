# Third-party notices

Zivi Atlas application code is released under the [MIT licence](LICENSE).
Third-party code and data retain their own licences and terms.

- **Leaflet 1.9.4**: BSD 2-Clause; see [the bundled licence](public/vendor/leaflet.LICENSE) and [upstream](https://github.com/Leaflet/Leaflet).
- **Leaflet.markercluster**: MIT; see [the bundled licence](public/vendor/leaflet.markercluster.LICENSE) and [upstream](https://github.com/Leaflet/Leaflet.markercluster).
- **Sites Vite plugin**: MIT, copyright OpenAI; see [the retained notice](build/sites-vite-plugin.LICENSE).
- **Vendored shadcn Tailwind CSS**: see [the retained licence](vendor/shadcn-tailwind-4.13.0.LICENSE.md).
- Dependencies installed through npm retain the licences supplied with their packages. Exact versions are recorded in `package-lock.json`.

## Institution data and maps

Institution names, locations, official contacts, activities and availability come
from the Austrian [Zivildienstserviceagentur Platzangebot](https://www.zivildienst.gv.at/zivildienst-stellen/platzangebot.html).
`public/data/snapshot.json` is a fallback copy of that public catalogue, not a dump
of personal collections, applications, emails or attachments. Its `lastUpdated`
field records the source timestamp. The MIT licence covers this project's code;
it does not grant rights to third-party catalogue data. Consult the source's terms
before redistributing or reusing that data independently.

Map data is provided by [OpenStreetMap contributors](https://www.openstreetmap.org/copyright).
The application retains visible OpenStreetMap and Leaflet attribution. Use of
OpenStreetMap's tile service remains subject to its
[tile usage policy](https://operations.osmfoundation.org/policies/tiles/).

Zivi Atlas is an independent project and is not an official service of the
Zivildienstserviceagentur.
