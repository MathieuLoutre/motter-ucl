			var container, stats;
			var camera, scene, renderer, controls;
			var projector;
			var ambientLight, directionalLight, directionalLight2; 
			var buildings, roads, enemies;
			var map_tree = {};
			var monsters = {};
			var buses = [];
			var player_position;
			var player_animation = new TWEEN.Tween();
			var clock = new THREE.Clock();
			var offset_zoom = 0;

			function init() {

				container = document.createElement( 'div' );
				container.id = "content";
				document.body.appendChild( container );

				stats = new Stats();
				stats.domElement.style.position = 'absolute';
				stats.domElement.style.top = '0px';
				container.appendChild( stats.domElement );

				zoom_plus = document.createElement('div');
				zoom_plus.id = "zoom_plus";
				container.appendChild(zoom_plus);

				zoom_minus = document.createElement('div');
				zoom_minus.id = "zoom_minus";
				container.appendChild(zoom_minus);

				projector = new THREE.Projector();

				scene = new THREE.Scene();
				buildings = new THREE.Object3D();
				enemies = new THREE.Object3D();
				roads = new THREE.Object3D();
				scene.add(buildings);
				scene.add(enemies);
				scene.add(roads);

				map_objects[Object.keys(map_objects)[0]].minX
				var limits = {minX: map_objects[Object.keys(map_objects)[0]].minX, minY: map_objects[Object.keys(map_objects)[0]].minY,
				 maxX: map_objects[Object.keys(map_objects)[0]].maxX, maxY: map_objects[Object.keys(map_objects)[0]].maxY};

				$.each(map_objects, function(index, value)
				{	
					limits.minX = Math.min(limits.minX, value.minX);
					limits.minY = Math.min(limits.minY, value.minY);
					limits.maxX = Math.max(limits.maxX, value.maxX);
					limits.maxY = Math.max(limits.maxY, value.maxY);

					if (value.key_type != "highway" && value.key_type != "bus_route")
					{
						var newBuildingShape = new THREE.Shape();
						
						$.each(value.shape, function(index, node)
						{
							if (index == 0)
							{
								newBuildingShape.moveTo(node.x, node.y);
							}
							else
							{
								newBuildingShape.lineTo(node.x, node.y);
							}
						});
						
						var newBuilding3D = newBuildingShape.extrude({amount: value.height, bevelEnabled: false});
						var mesh = new THREE.Mesh(newBuilding3D, new THREE.MeshLambertMaterial( { color: Math.random() * 0xffffff } ));
						mesh.rotation.x = 90 * (Math.PI / 180);
						mesh.position.set(value.x, value.height, value.y);
						buildings.add(mesh);
					}
					else if (value.key_type == "bus_route")
					{
						buses.push(value);
					}
					else
					{
						var road = new THREE.Geometry();
						
						$.each(value.shape, function(index, node)
						{
							road.vertices.push(new THREE.Vertex(new THREE.Vector3(node.x, 0, node.y)));
							
							//{a: {point: new Vector2(), links: {b, c}}}

							if (!(node.id in map_tree)) // Doesn't exist
							{
								map_tree[node.id] = {point: new THREE.Vector2(node.x + value.x, node.y + value.y), links: {}};
							}

							if (index == 0)
							{
								map_tree[node.id]['links'][value.shape[1].id] = map_tree[node.id].point.distanceToSquared(new THREE.Vector2(value.shape[1].x + value.x, value.shape[1].y + value.y));
							}
							else if (value.shape.length == index+1)
							{
								map_tree[node.id]['links'][value.shape[index-1].id] = map_tree[node.id].point.distanceToSquared(new THREE.Vector2(value.shape[index-1].x + value.x, value.shape[index-1].y + value.y));
							}
							else
							{
								map_tree[node.id]['links'][value.shape[index+1].id] = map_tree[node.id].point.distanceToSquared(new THREE.Vector2(value.shape[index+1].x + value.x, value.shape[index+1].y + value.y));
								map_tree[node.id]['links'][value.shape[index-1].id] = map_tree[node.id].point.distanceToSquared(new THREE.Vector2(value.shape[index-1].x + value.x, value.shape[index-1].y + value.y));
							}
						});
						
						var line = new THREE.Line(road, new THREE.LineBasicMaterial( { color: 0xffffff, opacity: 1.0, linewidth: 150.0 } ) );
						line.position.set(value.x, 0, value.y);
						roads.add(line);
					}
				});

				for (var k = 0; k < 200; k++)
				{
					var key = Object.keys(map_tree)[Math.floor(Math.random() * Object.keys(map_tree).length)]
					var geometry = new THREE.CubeGeometry( 4, 4, 4 );
					var material = new THREE.MeshLambertMaterial( { color: 0x66CD00, shading: THREE.FlatShading, overdraw: true } );
					var cube = new THREE.Mesh( geometry, material );
					cube.position.set(map_tree[key].point.x, 4, map_tree[key].point.y);
					monsters[cube.id] = key
					enemies.add(cube);
					animateRandom(cube, 200.0);
				}

				var geometry = new THREE.PlaneGeometry(10000, 10000);
				var planeMaterial = new THREE.MeshPhongMaterial( { color: 0xffffff } );
				THREE.ColorUtils.adjustHSV( planeMaterial.color, 0, 0, 0.9 );
				planeMaterial.ambient = planeMaterial.color;

				var ground = new THREE.Mesh( geometry, planeMaterial );

				ground.rotation.x = -90 * (Math.PI / 180);
				ground.position.set(limits.minX, -5, limits.minY);
				ground.castShadow = false;
				ground.receiveShadow = true;
				ground.name = "ground";
				scene.add(ground);

				var geometry = new THREE.CubeGeometry( 5, 5, 5 );
				var material = new THREE.MeshLambertMaterial( { color: 0x00ffee, shading: THREE.FlatShading, overdraw: true } );
				var cube = new THREE.Mesh( geometry, material );
				
				if (buses.length > 0)
				{
					cube.position.set(map_tree[buses[0].shape[0].id].point.x, 5, map_tree[buses[0].shape[0].id].point.y);
					player_position = buses[0].shape[0].id;
				}
				else
				{
					cube.position.set(map_tree[Object.keys(map_tree)[0]].point.x, 5, map_tree[Object.keys(map_tree)[0]].point.y);
					player_position = Object.keys(map_tree)[0];
				}

				cube.name = "player";
				scene.add(cube);

				camera = new THREE.PerspectiveCamera( 35, window.innerWidth / window.innerHeight, 1, 1000 );
				camera.position.x = map_tree[Object.keys(map_tree)[0]].point.x;
				camera.position.y = 200;
				camera.position.z = map_tree[Object.keys(map_tree)[0]].point.y + 60.0;
				camera.rotation.x = -70 * (Math.PI / 180);
				scene.add(camera);

				// Lights

				ambientLight = new THREE.AmbientLight( Math.random() * 0x10 );
				scene.add( ambientLight );

				directionalLight = new THREE.DirectionalLight(0xffffff);
				directionalLight.position.x = map_objects[0].minX;
				directionalLight.position.y = 200;
				directionalLight.position.z = map_objects[0].minY;
				directionalLight.position.normalize();
				scene.add( directionalLight );

				directionalLight2 = new THREE.DirectionalLight(0xffffff);
				directionalLight2.position.x = 0.9 - 0.5;
				directionalLight2.position.y = 0.9 - 0.5;
				directionalLight2.position.z = 0.9 - 0.5;
				directionalLight2.position.normalize();
				scene.add( directionalLight2 );

				renderer = new THREE.WebGLRenderer();
				renderer.setSize( window.innerWidth, window.innerHeight );
				container.appendChild(renderer.domElement);

				buses_object = new THREE.Object3D();
				scene.add(buses_object)

				for (var k = 0; k < buses.length; k++)
				{
					var geometry = new THREE.CubeGeometry( 10, 10, 10 );
					var material = new THREE.MeshLambertMaterial( { color: 0xff0000, shading: THREE.FlatShading, overdraw: true } );
					var cube = new THREE.Mesh( geometry, material );
					cube.rotation.y = -30 * (Math.PI / 180);
					cube.position.y = 4;

					buses_object.add(cube);
					$("#content").append('<div id="bus-'+cube.id+'" class="label">'+buses[k].type+'</div>');
					animateBus(cube, buses[k].shape, 75.0);
				}

				$("canvas").on('click', onDocumentMouseDown);
				$("#zoom_plus").on( 'click', click_zoom_plus );
				$("#zoom_minus").on( 'click', click_zoom_minus );
			}

			function animate() {

				requestAnimationFrame( animate );
				render();
				stats.update();
			}

			function render() {

				TWEEN.update();
				camera.position.x = scene.children[4].position.x;
				camera.position.z = scene.children[4].position.z + 60.0 + offset_zoom;
				// controls.update( clock.getDelta() );

				renderer.render( scene, camera );
			}

			function findClosest(point_clicked)
			{
				var close_point = Object.keys(map_tree)[0];

				for (key in map_tree)
				{
					if (point_clicked.distanceToSquared(map_tree[key].point) < point_clicked.distanceToSquared(map_tree[close_point].point))
					{
						close_point = key;
					}
				}

				return close_point;
			}

			function nextPoint()
			{
				var new_node = Object.keys(map_tree[player_position].links)[Math.floor(Math.random() * Object.keys(map_tree[player_position].links).length)];
				new TWEEN.Tween(scene.children[4].position).to( {
					x: map_tree[new_node].point.x,
					z: map_tree[new_node].point.y }, 2000).onComplete(nextPoint).start();
				player_position = new_node;
			}

			function animateObject(object, path, speed)
			{
				var update = function(){ object.position.x = current.x; object.position.z = current.z; }
				var current = object.position.clone();
				var i = 1;

				var nextPoint = function(){
					i++;
					if (i < path.length)
					{
						player_position = path[i];
						player_animation = new TWEEN.Tween(current).to({x: map_tree[path[i]].point.x, z: map_tree[path[i]].point.y }, Math.sqrt(map_tree[path[i-1]].links[path[i]])*speed).onUpdate(update).onComplete(nextPoint).start();
					}
				}

				player_position = path[i];
				player_animation = new TWEEN.Tween(current).to({x: map_tree[path[i]].point.x, z: map_tree[path[i]].point.y }, Math.sqrt(map_tree[path[i-1]].links[path[i]])*speed).onUpdate(update).onComplete(nextPoint).start();
			}

			function toScreenXY(position) {
			  var pos = position.clone();
			  var projScreenMat = new THREE.Matrix4();
			  projScreenMat.multiply(camera.projectionMatrix, camera.matrixWorldInverse);
			  projScreenMat.multiplyVector3( pos );

			  return { x: ( pos.x + 1 ) * ($("canvas").width()/2),
			      y: ( - pos.y + 1) * ($("canvas").height()/2) };
			}

			function animateBus(object, path, speed)
			{
				var update = function()
					{ 
						object.position.x = current.x; 
						object.position.z = current.z;
						var screenCoord = toScreenXY(object.position.clone());
						$("#bus-"+object.id).css("display", "block");
						$("#bus-"+object.id).css("top", screenCoord.y-20+"px");
						$("#bus-"+object.id).css("left", screenCoord.x-15+"px");
					}

				var current = object.position.clone();
				var i = 1;

				var nextPoint = function(){
					i++;
					if (i < path.length)
					{
						animation = new TWEEN.Tween(current).to({x: map_tree[path[i].id].point.x, z: map_tree[path[i].id].point.y }, Math.sqrt(map_tree[path[i-1].id].links[path[i].id])*speed).onUpdate(update).onComplete(nextPoint).start();
					}
					else
					{
						object.position.x = map_tree[path[0].id].point.x;
						object.position.z = map_tree[path[0].id].point.y;
						$("#bus-"+object.id).css("display", "none");
						animateBus(object, path, speed);
					}
				}

				var animation = new TWEEN.Tween(current).to({x: map_tree[path[i].id].point.x, z: map_tree[path[i].id].point.y }, Math.sqrt(map_tree[path[i-1].id].links[path[i].id])*speed).onUpdate(update).onComplete(nextPoint).delay((Math.random() * 5000) + (Math.random() * 8000)).start();
			}

			function animateRandom(object, speed)
			{
				var update = function(){ object.position.x = current.x; object.position.z = current.z; }
				var current = object.position.clone();

				var nextPoint = function()
				{
					var next = Object.keys(map_tree[monsters[object.id]].links)[Math.floor(Object.keys(map_tree[monsters[object.id]].links).length * Math.random())];
					var current_node = monsters[object.id];
					monsters[object.id] = next;

					new TWEEN.Tween(current).to({x: map_tree[next].point.x, z: map_tree[next].point.y }, Math.sqrt(map_tree[current_node].links[next])*speed).onUpdate(update).onComplete(nextPoint).start();
				}

				var next = Object.keys(map_tree[monsters[object.id]].links)[Math.floor(Object.keys(map_tree[monsters[object.id]].links).length * Math.random())];
				var current_node = monsters[object.id];
				monsters[object.id] = next;

				new TWEEN.Tween(current).to({x: map_tree[next].point.x, z: map_tree[next].point.y }, Math.sqrt(map_tree[current_node].links[next])*speed).onUpdate(update).onComplete(nextPoint).start();
			}

			function click_zoom_minus(event)
			{
				event.preventDefault();
				if (offset_zoom < 100)
				{
					camera.position.y += 10;
					offset_zoom += 2.5;
				}
			}

			function click_zoom_plus(event)
			{
				event.preventDefault();
				if (offset_zoom > 0)
				{
					camera.position.y -= 10;
					offset_zoom -= 2.5;
				}
			}

			function onDocumentMouseDown( event ) {

				event.preventDefault();

				var vector = new THREE.Vector3( ( event.clientX / window.innerWidth ) * 2 - 1, - ( event.clientY / window.innerHeight ) * 2 + 1, 0.5 );
				projector.unprojectVector( vector, camera );

				var ray = new THREE.Ray( camera.position, vector.subSelf( camera.position ).normalize() );

				var intersects = ray.intersectObjects( scene.children );
				var intersectsMonsters = ray.intersectObjects( scene.children[1].children );

				if (intersectsMonsters.length > 0)
				{
					var raylol = new THREE.Ray( scene.children[4].position, intersectsMonsters[0].object.position.clone().subSelf( scene.children[4].position ).normalize() );
					var intersectsBuilding = raylol.intersectObjects( scene.children[0].children );

					if (intersectsBuilding.length == 0)
					{
						scene.__removeObject(intersectsMonsters[0].object);
					}
					else 
					{
						var realIntersectsMonsters = raylol.intersectObjects( scene.children[1].children );

						if (intersectsBuilding[0].distance > realIntersectsMonsters[0].distance)
						{
							scene.__removeObject(intersectsMonsters[0].object);
						}
					}
				}
				else if (intersects.length > 0 && intersects[0].object.name == "ground") 
				{
					player_animation.stop();
					var closest = findClosest(new THREE.Vector2(intersects[0].point.x, intersects[0].point.z));
					var path = findPath(map_tree, player_position, closest);

					var pointClick = new THREE.Vector2(intersects[0].point.x, intersects[0].point.z);
					var pointClose = map_tree[closest].point.clone();
					var pointBefore = map_tree[path[path.length-1]].point.clone();

					pointClick.subSelf(pointClose).normalize();
					pointBefore.subSelf(pointClose).normalize();

					console.log(pointBefore.dot(pointClick)); // En dessous positif, au dessus negatif

					path.push(closest);													

					animateObject(scene.children[4], path, 25.0);
				}
			}