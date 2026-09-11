<template>
    <div  class="w-full h-full border border-gray-300 rounded-lg bg-white">
    <!-- viewer-box -->
        <div ref="viewerRef" class="w-full h-full"></div>
    </div>
</template>

<script setup>

import * as $3Dmol from "3dmol/build/3Dmol.js";
import { ref,onMounted } from "vue";
const viewerRef=ref(null)
onMounted(()=> {
    const pdbText = `
HETATM    1  C1  UNL     1       0.000   0.000   0.000  1.00  0.00           C
HETATM    2  O1  UNL     1       1.430   0.000   0.000  1.00  0.00           O
HETATM    3  H1  UNL     1      -0.540   0.935   0.000  1.00  0.00           H
HETATM    4  H2  UNL     1      -0.540  -0.935   0.000  1.00  0.00           H
CONECT    1    2    3    4
CONECT    2    1
CONECT    3    1
CONECT    4    1
END
`;
    
    const viewer = $3Dmol.createViewer(viewerRef.value, {
        backgroundColor: "white"
    });
    viewer.addModel(pdbText, "pdb");
    viewer.setStyle({}, {
        stick: {
            radius: 0.25,
            colorscheme: "Jmol"
        },
        sphere: {
            scale: 0.4,
            colorscheme: "Jmol"
        }
    });
    viewer.zoomTo();
    viewer.render();
})


</script>


