# Script history: proposals for DJ's veto

Built by scripts/build-script-history.js from the scripts, the family tree, contact.json (rulers, borders) and the atlas religion map. To strike a switch, veto it in the Scripts window's Switches tab and apply; or add `{ "lang": "<id>", "year": <year> }` to data/history/script-vetoes.json and rebuild (`npm run scripts:history`). The rebuild needs the religion map: andah-atlas, or its copy in data/canon/religion-map.json.

## The religions and their scripts

| Religion | Arose | Script |
|---|---|---|
| Tzinalli | 3000 BFA | the Arten glyphs of Areoix Lie (Arten script) |
| Kallimethra | 1000 BFA | many scripts, as Christianity: whichever script the people who brought the faith wrote (Emaran script, Lycroan script, Ealdorii script, Simplified Dahen script) |
| Imarel | 400 BFA | the Quian letters, each land in the nearest sister (Mikrolean script, Modern Ashonic script, Sakernlesi script, Kiiaavo script) |
| Thessovai | 300 BFA | Osnealan and Casan (Osnealan script, Casan script) |
| Kelhari | 200 BFA | the Alzurian abjad and the scripts grown from it (Ukhdari script, Ealdorii script, Estijan script, Acranan script, Zenashan script) |
| Srivandha | 500 AFA | the Sakernlesi script, its old rulers' (Sakernlesi script) |
| Passanu | 500 AFA | the Passonin script (Passonin script) |

## Proposed switches, living languages (42)

| Language | id | Year | From | To | Why |
|---|---|---|---|---|---|
| Nasucisan | `nasucisan` | 1530 AFA | Alzurian proto-writing | Saetnde script | colony (Emaran) |
| Ancient Kaalsite | `ancient-kaalsite` | 900 BFA | Alzurian proto-writing | Kaalsite script | own |
| Saetnde | `saetnde` | 500 BFA | Dahen proto-writing | Saetnde script | own |
| Ancient Misosn | `ancient-misosn` | 300 BFA | Alzurian proto-writing | Old Passonin script | family (Passonin) |
| Acranan | `acranan` | 300 AFA | Alzurian proto-writing | Acranan script | own |
| Classical Easuhuran | `classical-easuhuran` | 100 BFA | Alzurian proto-writing | Easuhuran script | own |
| Jiloth Inanian | `jiloth-inanian` | 975 AFA | Dahen proto-writing | Inanian script | rule (Inanian) |
| Yhyeevu Iarevan | `yhyeevu-iarevan` | 1480 AFA | Quian proto-writing | Iarevan script | rule (Iarevan) |
| Yerural Iarevan | `yerural-iarevan` | 1475 AFA | Quian proto-writing | Iarevan script | rule (Iarevan) |
| Zenashan | `zenashan` | 950 AFA | Old Passonin script | Zenashan script | own |
| Inanian | `inanian` | 900 AFA | Dahen proto-writing | Inanian script | own |
| Vesozatan | `vesozatan` | 1125 AFA | Dahen proto-writing | Kaastini script | rule (Kaastini) |
| Vesozatan | `vesozatan` | 1530 AFA | Kaastini script | Acranan script | colony (Acranan) |
| Dorimian | `dorimian` | 1200 AFA | Quian proto-writing | Dorimian script | own |
| Cenryi | `cenryi` | 830 AFA | Dahen proto-writing | Casan script | religion (Thessovai, brought by Seytinemasi) |
| Vayvelean | `vayvelean` | 1680 AFA | Old Osnealan script | Saetnde script | rule (Emaran) |
| Verstian | `verstian` | 1630 AFA | Quian proto-writing | Ashonic script | rule (Ashani) |
| Lierin | `lierin` | 800 AFA | Dahen proto-writing | Casan script | religion (Thessovai, brought by Seytinemasi) |
| Lierin | `lierin` | 860 AFA | Casan script | Dahen proto-writing | rule (Inanian) |
| Lierin | `lierin` | 1290 AFA | Dahen proto-writing | Casan script | rule (Trian) |
| Mylanese | `mylanese` | 1560 AFA | Quian proto-writing | Mylanese script | own |
| Amchan | `amchan` | 1190 AFA | Dahen proto-writing | Old Osnealan script | religion (Kallimethra, brought by Vekura Ocunese) |
| Anymnan | `anymnan` | 1685 AFA | Quian proto-writing | Saetnde script | rule (Emaran) |
| Ayrean | `ayrean` | 1635 AFA | Dahen proto-writing | Saetnde script | rule (Sianan) |
| Exilian | `exilian` | 900 AFA | Dahen proto-writing | Casan script | neighbour (Munela Trian) |
| Iarevan | `iarevan` | 900 AFA | Quian proto-writing | Iarevan script | own |
| Inrean | `inrean` | 980 AFA | Dahen proto-writing | Casan script | neighbour (Seytinemasi) |
| Jathuan | `jathuan` | 1000 AFA | Areoix Lie proto-writing | Jathuan script | own |
| Kusiernian | `kusiernian` | 1675 AFA | Dahen proto-writing | Easuhuran script | rule (Easuhuran) |
| Otiirican | `otiirican` | 1015 AFA | Dahen proto-writing | Casan script | religion (Thessovai, brought by Cenryi) |
| Ozinian | `ozinian` | 1445 AFA | Dahen proto-writing | Casan script | religion (Thessovai, brought by Trian) |
| Taingesez | `taingesez` | 1170 AFA | Dahen proto-writing | Casan script | religion (Thessovai, brought by Seytinemasi) |
| Tauber | `tauber` | 1685 AFA | Quian proto-writing | Saetnde script | rule (Emaran) |
| Toroait | `toroait` | 1685 AFA | Quian proto-writing | Saetnde script | rule (Emaran) |
| Yihnurdan | `yihnurdan` | 1100 AFA | Quian proto-writing | Yihnurdan script | own |
| Kaastini | `kaastini` | 1050 AFA | Dahen proto-writing | Kaastini script | own |
| Lyeiryal Ikzen | `lyeiryal-ikzen` | 1665 AFA | Alzurian proto-writing | Old Estijan script | rule (Estijan) |
| Urbiqu | `urbiqu` | 1565 AFA | Alzurian proto-writing | Old Estijan script | rule (Estijan) |
| Danocian | `danocian` | 1450 AFA | Saetnde script | Old Estijan script | religion (Kelhari, brought by Dabdan) |
| Ikzen | `ikzen` | 1615 AFA | Alzurian proto-writing | Old Estijan script | rule (Estijan) |
| Loghmi | `loghmi` | 1570 AFA | Alzurian proto-writing | Old Estijan script | rule (Estijan) |
| Duhmi | `duhmi` | 1545 AFA | Alzurian proto-writing | Old Estijan script | religion (Kelhari, brought by Estijan) |

## Proposed switches, dead languages and stages (27)

- Tyrnotean (`tyrnotean`) 1195 AFA: Dahen proto-writing to Inanian script, rule (Inanian)
- Etolic (`etolic`) 320 BFA: Dahen proto-writing to Alzurian proto-writing, rule (Passonin)
- Passonin (`passonin`) 300 BFA: Dahen proto-writing to Old Passonin script, own
- Secsuu (`secsuu`) 1530 AFA: Dahen proto-writing to Acranan script, colony (Acranan)
- Casan (`casan`) 405 AFA: Dahen proto-writing to Casan script, own
- Osnealan (`osnealan`) 100 AFA: Dahen proto-writing to Old Osnealan script, own
- Ashonic (`ashonic`) 200 AFA: Quian proto-writing to Ashonic script, own
- Classical Vascohn (`classical-vascohn`) 110 BFA: Alzurian proto-writing to Old Passonin script, neighbour (Ancient Misosn)
- Hondir Inanian (`hondir-inanian`) 1200 AFA: Dahen proto-writing to Inanian script, rule (Inanian)
- Kirvok Inanian (`kirvok-inanian`) 1195 AFA: Dahen proto-writing to Inanian script, rule (Inanian)
- Zinthi Inanian (`zinthi-inanian`) 1195 AFA: Dahen proto-writing to Inanian script, rule (Inanian)
- Stravik Cenryi (`stravik-cenryi`) 885 AFA: Dahen proto-writing to Casan script, rule (Seytinemasi)
- Hovrith Cenryi (`hovrith-cenryi`) 940 AFA: Dahen proto-writing to Casan script, rule (Seytinemasi)
- Minoan Verstian (`minoan-verstian`) 1675 AFA: Quian proto-writing to Ashonic script, rule (Verstian)
- Mikori Verstian (`mikori-verstian`) 1665 AFA: Quian proto-writing to Ashonic script, rule (Ashani)
- Tupalaru Iarevan (`tupalaru-iarevan`) 1550 AFA: Quian proto-writing to Iarevan script, rule (Iarevan)
- Rĩmarara Iarevan (`rimarara-iarevan`) 1575 AFA: Quian proto-writing to Iarevan script, rule (Iarevan)
- Yelaru Iarevan (`yelaru-iarevan`) 1550 AFA: Quian proto-writing to Iarevan script, rule (Iarevan)
- Varer (`varer`) 910 AFA: Saetnde script to Old Estijan script, rule (Middle Estijan)
- Varer (`varer`) 1160 AFA: Old Estijan script to Saetnde script, rule (Hadan)
- Varer (`varer`) 1510 AFA: Saetnde script to Old Estijan script, rule (Estijan)
- Tinikakon (`tinikakon`) 1190 AFA: Saetnde script to Old Estijan script, rule (Middle Estijan)
- Tinikakon (`tinikakon`) 1260 AFA: Old Estijan script to Saetnde script, rule (Low Verusan)
- Tinikakon (`tinikakon`) 1510 AFA: Saetnde script to Old Estijan script, rule (Estijan)
- Therna (`therna`) 1510 AFA: Saetnde script to Old Estijan script, rule (Estijan)
- Xilil Ikzen (`xilil-ikzen`) 1665 AFA: Alzurian proto-writing to Old Estijan script, rule (Estijan)
- Zarsing (`zarsing`) 1585 AFA: Alzurian proto-writing to Old Estijan script, rule (Estijan)

## Living languages still unwritten in 1765 (8)

Surtan, Yvian, Northern Yvian, Qefih, Femere, Hozutuxepi, Nyttani, Garlls

## Who writes what in 1765

- **Dahen proto-writing** (98): Agai, Ankotoan, Ashi Ywa, Atirhan Dahen, Baleen, Beluue, Cakka-Qiowa, Classical Ywa, Cutrans, Dahen, Faigan, Fanian, Fekunza Dahen, Fijani, Geroai, Ginupun, Gyua Dahen, Hah, Haouo, Haowou, Hian, Hian-Liahou, Hria, Huouo, Hwewēi Kaastini, Jeha, Jotoro, Kammai, Kastini-Ururo, Khela, Koamontol, Kon Danua, Kwan, Liahou, Lirali, Liuro, Middle Baleen, Middle Dahen, Migokan, New Xuandai, Nolecha, North Jathian, Northeastern Dahen, Northern Shie, Northern Wuia, Old Agai, Old Baleen, Old Chu, Old Dahen, Old Qai-Shie, Old Secssu, Old Xia, Oscairian, Oucuo, Oulaonese, Pha Hii Dialect, Pounai, Qai, Qai Min, Qai Pauzuia, Qai Qi, Qai Zhao, Qaomian, Rickeic, Secssu, Shianese, Shianwu, Shie, Shinamese, Silin, Southern Shie, Southern Wuia, Southwestern Dahen, Standard Dahen, Suenan, Tal, Tanglea, Timbai, Tivela, Troyssau, Troyssau-Valoroto, Tsjinai, Upper Dahen, Ururo, Vally, Valoroto, Vass, Wan, Wuhou, Wuia, Xia, Xin Kuriang, Xuqilinese, Yeszeu, Ywa, Zaahr, Zayliabao, Zhaobiann
- **Saetnde script** (40): Anymnan, Aplasian Creole, Astarii, Ayrean, Divopaneyi, Eastern Saetnde, Emaran, Ersuckl, Eute, Hadan, High Verusan, Hiliyite, Ioithin, Kidobu-Vulime, Lastnu, Low Verusan, Lycroan, Middle Emaran, Middle Lycroan, Nasucisan, Northern Saetnde, Old Emaran, Old Lycroan, Pifanobi, Rkmepuii Emaran, Rnerwy, Rterrider, Saetnde, Seubi, Sianan, Southern Saetnde, Syrceall, Tauber, Toroait, Uularin, Vayvelean, Verusan, Vestorian, Vulime, Yaxuto-Vulime
- **Areoix Lie proto-writing** (27): Arten, Asturian, Bayudaiar, Bespi, Feian, Gweham, Heisan, Hikorai Munagu, Hunakwe Taldi, Hyinil, Iquirian, Khweham, Laugwala, Lauham, Mahana Arten, Meau Sattlean, Munagu, Mwunwu, Othyan, Raumwo Iquirian, Reawuhiah Jathuan, Sattlean, Taldi, Tanidunan, Terressin, Western Arten, Yetyialò Asturian
- **Alzurian proto-writing** (24): Aiisaran, Alzurian-Vascohni, Ancient Kaldari, Classical Ealdorii, Classical Ukhdari, Ealdorii, Eldjan, Eserign, Ezmehn Fravelan, Fravala, Kaldari, Middle Ealdorii, Middle Ukhdari, Mintarchesee, Old Ealdorii, Old Ukhdari, Paditoran, Proto-Kaalsite, Proto-Ukhdari, Seljan, Southern Vasconian, Tybardan, Ukhdari, Western Alzurian
- **Quian proto-writing** (21): Aksalshai, Biorundi, Dalalëru Mylanese, Desakian, Finaean, Gngikzara Mylanese, Hehu Tauber, Hyelenian, Hyian, Ilarara Desakian, Lhicurai, Mihilian, Mihkose Sursian, Onphellan, Panerira Desakian, Pelugrotoan, Quidican, Shomjindian, Sursian, Trenz, Yeevu Hyian
- **Old Passonin script** (20): Acairn Misosn, Alqiran, Ancient Misosn, Canldivese, Eosl, Ẽina Iainoan, Haizan, Heoan, Hkuqoan, Hujan, Iainoan, Iroan, Isarian, Jshainian, Kafan Iroan, Metndrian Alqiran, Misosn, Old Iroan, Proto-Hujan, Threch
- **Old Estijan script** (18): Balaroiun, Bewilojega, Danocian, Duhmi, Estijan, Fermorian, Ikzen, Kizuran Estijan, Koruch, Loghmi, Lydroan, Lyeiryal Ikzen, Middle Estijan, Old Estijan, Paasseh, Rakoka, Southern Yvian, Urbiqu
- **Easuhuran script** (11): Classical Easuhuran, Delare, Early Modern Easuhuran, Easuhuran, Elenin, Healderem, Hiwushi, Kusiernian, Middle Easuhuran, Old Easuhuran, Rozoans
- **Casan script** (10): Cenryi, Exilian, Inrean, Lierin, Otiirican, Ozinian, Seytinemasi, Sivosan, Taingesez, Trian
- **Old Osnealan script** (8): Amchan, Galcan, Isnti, Kiesian, Ocunese, Sadainite, Selajan, Vekura Ocunese
- **Kaalsite script** (4): Ancient Kaalsite, Kaalsite, Middle Kaalsite, Old Kaalsite
- **Mahen wedge script** (3): Old Veruni, Taoisian, Veruni
- **Iarevan script** (3): Iarevan, Yerural Iarevan, Yhyeevu Iarevan
- **Ashonic script** (3): Ashani, Sunsokuan, Verstian
- **Acranan script** (2): Acranan, Vesozatan
- **Inanian script** (2): Inanian, Jiloth Inanian
- **Zenashan script** (1): Zenashan
- **Dorimian script** (1): Dorimian
- **Sanagaran script** (1): Sanagaran
- **Mylanese script** (1): Mylanese
- **Jathuan script** (1): Jathuan
- **Yihnurdan script** (1): Yihnurdan
- **Kaastini script** (1): Kaastini
