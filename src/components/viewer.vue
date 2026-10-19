<template>
  <div class="w-full h-full border border-gray-300 rounded-lg bg-white">
    <!-- viewer-box -->
    <div ref="viewerRef" class="w-full h-full"></div>
  </div>
</template>

<script setup>
import * as $3Dmol from "3dmol/build/3Dmol.js";
import { ref, onMounted } from "vue";
import { origin } from "../utils/oringin";
const viewerRef = ref(null);
onMounted(() => {
  const pdbText = `
HETATM    1  C1  UNL     1       0.000   0.000   0.000  1.00  0.00           C
HETATM    2  O1  UNL     1       1.430   0.000   0.000  1.00  0.00           O
HETATM    3  H1  UNL     1      -0.540   0.935   0.000  1.00  0.00           H
HETATM    4  H2  UNL     1      -0.540  -0.935   0.000  1.00  0.00           H

END
`;

  let item = null;
  let viewer = $3Dmol.createViewer(viewerRef.value, {
    backgroundColor: "white",
  });
  viewer.addModel(pdbText, "pdb", { keepH: true });
  viewer.setStyle(
    {},
    {
      stick: {
        radius: 0.25,
        colorscheme: "Jmol",
      },
      sphere: {
        scale: 0.4,
        colorscheme: "Jmol",
      },
    },
  );

  let defaultStyle = {
    stick: { radius: 0.25, colorscheme: "Jmol" },
    sphere: { scale: 0.4, colorscheme: "Jmol" },
  };

  viewer.setClickable({}, true, function (atom) {
    // 每次点击先将全部原子恢复默认样式
    viewer.setStyle({}, defaultStyle);

    if (item !== atom.index) {
      item = atom.index;

      viewer.setStyle(
        { model: atom.model, index: item },
        {
          stick: { radius: 0.25, color: "red" },
          sphere: { scale: 0.4, color: "red" },
        },
      );
    } else {
      // 再次点击同一个原子，取消选中
      item = null;
    }
    console.log("原子坐标：", [atom.x, atom.y, atom.z]);
    origin.position = [atom.x, atom.y, atom.z];
    console.log(origin.position);
    viewer.render();
  });


  viewer.zoomTo();
  viewer.render();
});

</script>
