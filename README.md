# Mapbox Raster Reprojection Layer

A client-side raster reprojection layer from non-mercator projections to mercator projection.

Like [OpenLayers Raster Reprojection](https://openlayers.org/en/latest/examples/reprojection.html).

Online Demo [codesandbox](https://codesandbox.io/p/github/BranZhang/Mapbox-Raster-Reprojection-Layer/csb-oig8h5/Mapbox-Raster-Reprojection-Layer?file=%2Fsrc%2Findex.js)

![](images/demo1.png)

![](images/demo2.png)

## API

## Examples

## Problems

1. Each custom Source uses 2 canvas, if you create multi layers, may cause 'Oldest context will be lost' error. Because browser has a limitation about how many canvas with 3D context are on 1 page. (All Reprojection Custom Sources share canvas will fix this.)
2. Some projections are not supported yet.
3. 1 pixel at each tiles edge is dropped for preventing flashing seams, a better solution is copying edge pixels out to a 1px border like Mapbox.