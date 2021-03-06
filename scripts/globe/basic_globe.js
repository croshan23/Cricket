
var VIS = VIS || {};

VIS.BasicGlobe = function($container) {

    var $topCanvas;
    var topCanvasCtx;
    var globe;
    var projector;
    var clickableMeshes = new Array();
    var teamHighlightMeshes = {};
    var yearIndexes = [];
    var yearPointers = new Array();
    var teamCache = {};
    var worldCupWinYearsPerTeam = {};
    var numYears;
    var $radialContainer;
    var flagCentered = false;
    var unloaded = false;

    function animate() {
        // NOTE: Probably should not have to make this check, but it
        // seems to help.
        if (unloaded)
            return;
        requestAnimationFrame(animate);
        render();
    }

    function render() {
        globe.render();
    }

    function load() {
        $container = $container || $('#container');
        $container.height($(window).height());
        $container.width($(window).width());
        $container.click(globeClicked);
        projector = new THREE.Projector();
        globe = new DAT.Globe($container[0], null, null, false,
                null, centeredFlag);
        loadTopCanvas();
        loadTeams();
        animate();
    }

    function unload() {
        unloaded = true;
        $container.unbind('click', globeClicked);
        $container.html('');
        delete projector;
        delete teamHighLightMeshes;
        delete globe;
    }

    function loadTopCanvas() {
        $topCanvas = $('<canvas>');
        $topCanvas.appendTo($container);
        $topCanvas.css({
            position:'absolute',
            'z-index': '1',
            margin:'0px',
            padding:'0px',
            visiblity:true,
        });
        $topCanvas[0].width = $(window).width();
        $topCanvas[0].height = $(window).height();
        topCanvasCtx = $topCanvas[0].getContext('2d');
        topCanvasCtx.scale(1.0,1.0);
    }

    function loadModels() {
        $.getJSON('testdata/stats.json', function(data) {
            for (i=0;i<data.length;i++) {
                globe.addData(data[i][1], {
                    format: 'magnitude',
                    name: data[i][0],
                    animated: true,
                    models: data[i][2]
                });
            }
            loadTeams();
            animate();
        });
    }

    function loadTeams() {
        $.getJSON('php/getTeams.php', function(data) {
            var teamItems = [];
            var $ul = $('<ul/>', {
                'class': 'teamList',
            });
            $.each(data, function(key, val) {
                addTeam(val.latitude, val.longitude, val.code);
                teamCache[val.code] = {
                    'lat': val.latitude,
                    'lng': val.longitude,
                    'name': val.name,
                };
            });
            loadWorldCupData();
        });
    }

    function loadWorldCupData() {
        function dataLoaded(data) {
            $radialContainer = $("<div id='radial_container'>")
                .css('z-index','100')
                .appendTo($container);
            var $ul = $('<ul/>', {
                'class': 'yearList',
            }).appendTo($radialContainer);

            numYears = 0;
            $.each(data, function(year, val) {
                yearIndexes.push(year);
                var $year = $('<li class="yearItem" id="' + val.code + '">')
                    .appendTo($ul)
                    .append('<div class="yearItemText" id="'+
                        val.code + '">' + year + '</div>');
                $year.data('lat', val.latitude);
                $year.data('lng', val.longitude);
                $year.data('code', val.code);
                $year.data('mesh', teamHighlightMeshes[val.code]);
                if (worldCupWinYearsPerTeam[val.code] == undefined)
                    worldCupWinYearsPerTeam[val.code] = [];
                worldCupWinYearsPerTeam[val.code].push($year);
                numYears++;
            });
            //console.log('Height, width', $container.css('height'),
                //$container.css('width'), $(window).height(), $(window).width());

            var radius = $(window).height()/2 - 50;
            $radialContainer.radius = radius;

            var width = $(window).width()/2 - 20;
            var height = $(window).height()/2 - 25;

            $radialContainer.radmenu({
                listClass: 'yearList',
                itemClass: 'yearItem',
                radius: radius,
                animSpeed: 100,
                centerX: width,
                centerY: height,
                selectEvent: "click",
                onSelect: function($selected, event){
                    $selected.siblings().removeClass('active');
                    $selected.addClass('active');
                    var $yearElement = $($selected.children()[0]);
                    var code = $yearElement.attr('id');
                    $yearElement.data('lat', teamCache[code].lat);
                    $yearElement.data('lng', teamCache[code].lng);
                    $yearElement.data('code', code);
                    yearSelected($yearElement, event);
                },
                angleOffset: 0
            });
            $radialContainer.radmenu("show");
        }
        $.getJSON('php/getWorldCupGlobeData.php', function(data) {
            dataLoaded(data);
        });
    }

    function addTeam(lat, lng, code) {
        var flagMesh = globe.addFlag(lat, lng,
                'images/flags/'+code+'.gif', code);
        teamHighlightMeshes[code] = flagMesh;
        flagMesh.lat = lat;
        flagMesh.lng = lng;
        clickableMeshes.push(flagMesh);
    }

    function clearContext() {
        topCanvasCtx.clearRect(0,0,$topCanvas.width(),$topCanvas.height());
    }

    function globeClicked(event) {
        if (!flagCentered) {
            clearActiveYears();
            clearContext();
        }
        var x = ( event.clientX / window.innerWidth ) * 2 - 1;
        var y = - ( event.clientY / window.innerHeight ) * 2 + 1;
        var vector = new THREE.Vector3( x, y, 0.5 );
        projector.unprojectVector( vector, globe.camera );
        var ray = new THREE.Ray( globe.camera.position,
                vector.subSelf( globe.camera.position ).normalize() );
        var hits = ray.intersectObjects(clickableMeshes);

        if (hits.length) {
            console.log("Team Location clicked!", hits);
            var hit = hits[0].object;
            globe.curLat = hit.lat;
            globe.curLong = hit.lng;
            clearContext();
            clearActiveYears();
            highlightFromCode(hit.code);
        } else {
            console.log("Click detected, but no target was hit.", hits);
        }
    }

    // NOTE: This method is relatively broken, that's why it's not
    // being used.
    function yearSelected3d($yearElement, event) {
        teamSelected($yearElement);
        var geometry = new THREE.CylinderGeometry( 0, 10, 100, 3 );
        geometry.applyMatrix( new THREE.Matrix4()
            .setRotationFromEuler(new THREE.Vector3(Math.PI/2,Math.PI,0)));
        var material = new THREE.MeshNormalMaterial();
        var mesh = new THREE.Mesh( geometry, material );

        var code = $yearElement.data('code');
        var teamMesh = teamHighlightMeshes[code];

        var x = ( event.clientX / window.innerWidth ) * 2 - 1;
        var y = - ( event.clientY / window.innerHeight ) * 2 + 1;
        var vector = new THREE.Vector3( x, y, 0.5 );
        projector.unprojectVector( vector, globe.camera );
        var ray = new THREE.Ray( globe.camera.position,
                vector.subSelf( globe.camera.position ).normalize() );

        mesh.position.x = vector.x;
        mesh.position.y = vector.y;
        mesh.position.z = vector.z;
        mesh.lookAt(teamMesh.position);
        yearPointers.push(mesh);
        globe.scene.add( mesh );
    }

    function getAngleOfYear(year) {
        var idx = yearIndexes.indexOf(year);
        return 2 * Math.PI * parseFloat(idx/numYears);
    }

    function yearSelected($yearElement, event, skipTeamSelection) {
        if (!skipTeamSelection)
            rotateToTeam($yearElement);
        clearContext();
        connectElement($yearElement);
    }

    function centeredFlag(code) {
        clearContext();
        if (code) {
            flagCentered = true;
            highlightFromCode(code);
        }
        else {
            flagCentered = false;
            clearActiveYears();
        }
    }

    function clearActiveYears() {
        //if (!$radialContainer)
            //return;
        $radialContainer.find('.radial_div_item.active').removeClass('active');
    }

    function highlightFromCode(code) {
        $radialContainer.find('.radial_div #'+code).each(
            function(idx, yearOuter) {
                $(yearOuter).parent().addClass('active');
                connectElement($(yearOuter));
            }
        );
    }

    function connectElement($yearElement) {
        var angle = getAngleOfYear($yearElement.text());
        topCanvasCtx.globalAlpha = 0.4;
        topCanvasCtx.fillStyle = '#ff0000';

        var x2 = $topCanvas.width()/2;
        var y2 = $topCanvas.height()/2;
        var h = $yearElement.height();
        var w = $yearElement.width();
        var x0 = $yearElement.offset().left;
        var y0 = $yearElement.offset().top;
        var x1 = x0 + (Math.cos(angle));
        var y1 = y0 + (Math.sin(angle));

        var offX = (w * Math.sin(angle))/2;
        var offY = (h * Math.cos(angle))/2;
        var xM = (x1 + x1 + w)/2;
        var yM = (y1 + y1 + h)/2 - 12;

        topCanvasCtx.beginPath();
        topCanvasCtx.moveTo(xM - offX, yM + offY);
        topCanvasCtx.lineTo(xM + offX, yM - offY);
        topCanvasCtx.lineTo(x2,y2);
        topCanvasCtx.fill();
    }


    function teamSelected($teamElement, skipYearConnection) {
        clearContext();
        clearActiveYears();
        if (!skipYearConnection)
            connectYearsForTeam($teamElement);
        rotateToTeam($teamElement);
    }

    function rotateToTeam($teamElement) {
        var lat, lng;
        if (!$teamElement.data('lat') || !$teamElement.data('lng')) {
            var code = $teamElement.attr('id');
            if (teamCache[code] == undefined) {
                console.log('Error: Invalid team selected', $teamElement, code);
                return;
            }
            lat = teamCache[code].lat;
            lng = teamCache[code].lng;
        } else {
            lat = $teamElement.data('lat');
            lng = $teamElement.data('lng');
        }
        globe.curLat = lat;
        globe.curLong = lng;
    }

    function connectYearsForTeam($teamElement) {
        var code = $teamElement.attr('code');
        // TODO: Indicate that a team hasn't won.
        var years = worldCupWinYearsPerTeam[code];
        if (years == undefined)
            return;
        highlightFromCode(code);
    }

    this.load = load;
    this.unload = unload;
    this.teamSelected = teamSelected;
    this.requiredMenus = {
        'teamClick': teamSelected,
    };
};
